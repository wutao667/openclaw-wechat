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
import type { CallInterceptor } from "./types.js";
export declare const smartsheetUploadInterceptor: CallInterceptor;
