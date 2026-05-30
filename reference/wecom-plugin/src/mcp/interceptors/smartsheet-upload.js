/**
 * smartsheet_add_records / smartsheet_update_records 本地文件上传拦截器
 *
 * 核心逻辑：
 * 大模型在调用 smartsheet_add_records / smartsheet_update_records 时，
 * 可在 CellImageValue 中传入 image_path（本地图片路径）代替 image_url/title，
 * 或在 CellAttachmentValue 中传入 file_path（本地文件路径）代替 file_id。
 *
 * 本拦截器在 beforeCall 阶段：
 *   1. 深度扫描 records[].values 中的所有字段值，收集含 image_path / file_path 的单元格
 *   2. 校验文件大小：单文件不超过 10MB，所有文件总计不超过 20MB
 *   3. 并行读取本地文件 → base64 编码 → 调用 MCP 上传接口
 *      - image_path → upload_doc_image → 获取 image_url
 *      - file_path → upload_doc_file → 获取 file_id
 *   4. 用上传结果替换原字段，移除 image_path / file_path
 *   5. 返回修改后的完整 args
 *
 * 传给 MCP Server 的始终是标准协议格式（image_url / file_id），
 * MCP Server 不需要感知 image_path / file_path 的存在。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sendJsonRpc } from "../transport.js";
// ============================================================================
// 常量
// ============================================================================
/** 单个文件大小上限：10MB */
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024;
/** 所有文件总大小上限：20MB */
const MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024;
/** 上传请求超时时间（毫秒）：单次上传最大 10MB base64，给足时间 */
const UPLOAD_TIMEOUT_MS = 60_000;
/** beforeCall 整体超时延长到 120s（可能有多个文件并行上传） */
const INTERCEPTOR_TIMEOUT_MS = 120_000;
/** 日志前缀 */
const LOG_TAG = "[mcp] smartsheet-upload:";
// ============================================================================
// 内部辅助函数
// ============================================================================
/**
 * 深度扫描 records 中所有含 image_path / file_path 的单元格值对象，
 * 返回待上传任务列表。
 *
 * records 结构：
 *   [{ values: { "字段A": [{ image_path: "..." }], "字段B": [{ file_path: "..." }] } }]
 *
 * 字段值可能是数组（图片/附件/文本等）或标量（数字/布尔等），
 * 仅对数组中的对象元素进行扫描。
 */
function collectUploadTasks(records) {
    const tasks = [];
    for (const record of records) {
        const values = record.values;
        if (!values || typeof values !== "object")
            continue;
        for (const fieldKey of Object.keys(values)) {
            const fieldValue = values[fieldKey];
            if (!Array.isArray(fieldValue))
                continue;
            for (const cellValue of fieldValue) {
                if (!cellValue || typeof cellValue !== "object")
                    continue;
                const cell = cellValue;
                if (typeof cell.image_path === "string" && cell.image_path) {
                    tasks.push({
                        kind: "image",
                        filePath: cell.image_path,
                        title: typeof cell.title === "string" ? cell.title : undefined,
                        cellValue: cell,
                    });
                }
                else if (typeof cell.file_path === "string" && cell.file_path) {
                    tasks.push({
                        kind: "file",
                        filePath: cell.file_path,
                        cellValue: cell,
                    });
                }
            }
        }
    }
    return tasks;
}
/**
 * 校验所有待上传文件的大小
 *
 * - 单文件 > 10MB → 报错
 * - 所有文件累计 > 20MB → 报错
 */
async function validateFileSizes(tasks) {
    let totalSize = 0;
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        let stat;
        try {
            stat = await fs.stat(task.filePath);
        }
        catch (err) {
            throw new Error(`${LOG_TAG} 无法访问文件 "${task.filePath}": ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!stat.isFile()) {
            throw new Error(`${LOG_TAG} "${task.filePath}" 不是一个文件`);
        }
        if (stat.size > MAX_SINGLE_FILE_SIZE) {
            throw new Error(`${LOG_TAG} 文件 "${task.filePath}" 大小 ${(stat.size / 1024 / 1024).toFixed(1)}MB 超过单文件上限 10MB`);
        }
        totalSize += stat.size;
        if (totalSize > MAX_TOTAL_FILE_SIZE) {
            throw new Error(`${LOG_TAG} 累计文件大小 ${(totalSize / 1024 / 1024).toFixed(1)}MB 超过总上限 20MB（在文件 "${task.filePath}" 处超出）`);
        }
    }
    if (totalSize > 0) {
        console.log(`${LOG_TAG} 文件大小校验通过，共 ${tasks.length} 个文件，总计 ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    }
}
/**
 * 执行单个图片上传任务
 *
 * 读取本地文件 → base64 → 调用 upload_doc_image → 替换 cellValue
 */
async function executeImageUpload(task, docLocator) {
    const buffer = await fs.readFile(task.filePath);
    const base64Content = buffer.toString("base64");
    const fileName = path.basename(task.filePath);
    console.log(`${LOG_TAG} 上传图片: "${task.filePath}" (${(buffer.length / 1024).toFixed(0)}KB)`);
    const result = await sendJsonRpc("doc", "tools/call", {
        name: "upload_doc_image",
        arguments: {
            ...docLocator,
            base64_content: base64Content,
        },
    }, { timeoutMs: UPLOAD_TIMEOUT_MS });
    // 从 MCP result 中提取业务响应
    const bizData = extractBizData(result, "upload_doc_image");
    const imageUrl = bizData.url;
    if (!imageUrl) {
        throw new Error(`${LOG_TAG} upload_doc_image 未返回 url，文件: "${task.filePath}"`);
    }
    // 替换 cellValue：设置 image_url + title，移除 image_path
    task.cellValue.image_url = imageUrl;
    task.cellValue.title = task.title || fileName;
    delete task.cellValue.image_path;
    console.log(`${LOG_TAG} 图片上传成功: "${task.filePath}" → image_url="${imageUrl}"`);
}
/**
 * 执行单个文件上传任务
 *
 * 读取本地文件 → base64 → 调用 upload_doc_file → 替换 cellValue
 */
async function executeFileUpload(task) {
    const buffer = await fs.readFile(task.filePath);
    const base64Content = buffer.toString("base64");
    const fileName = path.basename(task.filePath);
    console.log(`${LOG_TAG} 上传文件: "${task.filePath}" (${(buffer.length / 1024).toFixed(0)}KB)`);
    const result = await sendJsonRpc("doc", "tools/call", {
        name: "upload_doc_file",
        arguments: {
            file_name: fileName,
            file_base64_content: base64Content,
        },
    }, { timeoutMs: UPLOAD_TIMEOUT_MS });
    // 从 MCP result 中提取业务响应
    const bizData = extractBizData(result, "upload_doc_file");
    const fileId = bizData.fileid;
    if (!fileId) {
        throw new Error(`${LOG_TAG} upload_doc_file 未返回 fileid，文件: "${task.filePath}"`);
    }
    // 替换 cellValue：设置 file_id，移除 file_path
    task.cellValue.file_id = fileId;
    delete task.cellValue.file_path;
    console.log(`${LOG_TAG} 文件上传成功: "${task.filePath}" → file_id="${fileId}"`);
}
/**
 * 从 MCP tools/call 返回结构中提取业务 JSON 数据
 *
 * MCP result 格式：{ content: [{ type: "text", text: "{...json...}" }] }
 */
function extractBizData(result, interfaceName) {
    const content = result?.content;
    if (!Array.isArray(content)) {
        throw new Error(`${LOG_TAG} ${interfaceName} 响应格式异常：缺少 content 数组`);
    }
    const textItem = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (!textItem) {
        throw new Error(`${LOG_TAG} ${interfaceName} 响应格式异常：content 中无 text 类型条目`);
    }
    let bizData;
    try {
        bizData = JSON.parse(textItem.text);
    }
    catch {
        throw new Error(`${LOG_TAG} ${interfaceName} 响应非 JSON: ${textItem.text.slice(0, 200)}`);
    }
    if (bizData.errcode !== 0) {
        throw new Error(`${LOG_TAG} ${interfaceName} 业务错误: errcode=${bizData.errcode}, errmsg=${bizData.errmsg ?? "unknown"}`);
    }
    return bizData;
}
/**
 * 从 args 中提取文档定位参数（docid 或 url），用于 upload_doc_image
 */
function extractDocLocator(args) {
    if (typeof args.docid === "string" && args.docid) {
        return { docid: args.docid };
    }
    if (typeof args.url === "string" && args.url) {
        return { url: args.url };
    }
    throw new Error(`${LOG_TAG} args 中缺少 docid 或 url，无法调用 upload_doc_image`);
}
// ============================================================================
// 拦截器实现
// ============================================================================
export const smartsheetUploadInterceptor = {
    name: "smartsheet-upload",
    /** 对 doc 品类的 smartsheet_add_records / smartsheet_update_records 生效 */
    match: (ctx) => ctx.category === "doc" &&
        (ctx.method === "smartsheet_add_records" || ctx.method === "smartsheet_update_records"),
    /** 扫描 records 中的 image_path / file_path，上传后替换为 image_url / file_id */
    beforeCall(ctx) {
        const records = ctx.args.records;
        if (!Array.isArray(records) || records.length === 0) {
            return undefined;
        }
        // 收集所有待上传任务
        const tasks = collectUploadTasks(records);
        if (tasks.length === 0) {
            return undefined;
        }
        console.log(`${LOG_TAG} 检测到 ${tasks.length} 个本地文件待上传`);
        // 异步执行上传流程
        return resolveUploads(ctx, tasks);
    },
};
/**
 * 执行文件校验和并行上传，返回替换后的 args
 */
async function resolveUploads(ctx, tasks) {
    // 阶段 1：文件大小校验
    await validateFileSizes(tasks);
    // 提取文档定位参数（仅图片上传需要）
    const hasImageTasks = tasks.some((t) => t.kind === "image");
    let docLocator = {};
    if (hasImageTasks) {
        docLocator = extractDocLocator(ctx.args);
    }
    // 阶段 2：并行执行所有上传任务
    // 上传完毕后 task.cellValue 已被原地修改（image_path/file_path 已替换为 image_url/file_id）
    const uploadStart = performance.now();
    await Promise.all(tasks.map((task) => {
        if (task.kind === "image") {
            return executeImageUpload(task, docLocator);
        }
        return executeFileUpload(task);
    }));
    const uploadMs = (performance.now() - uploadStart).toFixed(1);
    console.log(`${LOG_TAG} 全部上传完成，共 ${tasks.length} 个文件，耗时 ${uploadMs}ms`);
    // args 中的 records 已被原地修改，返回完整 args + 延长超时
    return {
        args: { ...ctx.args },
        timeoutMs: INTERCEPTOR_TIMEOUT_MS,
    };
}
