/**
 * MCP Streamable HTTP 传输层模块
 *
 * 负责:
 * - MCP JSON-RPC over HTTP 通信（发送请求、解析响应）
 * - Streamable HTTP session 生命周期管理（initialize 握手 → Mcp-Session-Id 维护 → 失效重建）
 * - 自动检测无状态 Server：如果 initialize 响应未返回 Mcp-Session-Id，
 *   则标记为无状态模式，后续请求跳过握手和 session 管理
 * - SSE 流式响应解析
 * - MCP 配置运行时缓存（通过 WSClient 拉取 URL 并缓存在内存中）
 */
import { generateReqId } from "@wecom/aibot-node-sdk";
import { fetch as undiciFetch } from "undici";
import { DEFAULT_ACCOUNT_ID } from "../openclaw-compat.js";
import { getWeComWebSocket } from "../state-manager.js";
import { MCP_GET_CONFIG_CMD, MCP_CONFIG_FETCH_TIMEOUT_MS } from "../const.js";
import { withTimeout } from "../timeout.js";
import { PLUGIN_VERSION } from "../version.js";
import { getWeComRuntime } from "../runtime.js";
import { resolveDefaultWeComAccountId, listWeComAccountIds, resolveWeComAccountMulti, } from "../accounts.js";
// ============================================================================
// 内部状态
// ============================================================================
/** HTTP 请求超时时间（毫秒） */
const HTTP_REQUEST_TIMEOUT_MS = 30_000;
/** 媒体下载请求超时时间（毫秒），base64 编码的媒体文件最大可达 ~27MB */
export const MEDIA_DOWNLOAD_TIMEOUT_MS = 120_000;
/** 日志前缀 */
const LOG_TAG = "[mcp]";
/** 请求 MCP Server 时透传可信企业微信 userid 的 header 名 */
export const WECOM_USERID_HEADER = "x-openclaw-wecom-userid";
/**
 * 构造 MCP 请求使用的 User-Agent
 *
 * 格式：`OpenClawPlugin/<version> <platform>/<arch>`
 * 例如：`OpenClawPlugin/0.1.3 linux/x86_64`
 *
 * 说明：
 * - version: 取自 package.json 的 PLUGIN_VERSION
 * - platform: process.platform（linux / darwin / win32 ...）
 * - arch: 将 Node 的 `x64` 归一化为传统 Unix 风格 `x86_64`，其他架构原样返回
 */
function buildUserAgent() {
    const archMap = {
        x64: "x86_64",
        ia32: "i386",
    };
    const arch = archMap[process.arch] ?? process.arch;
    return `OpenClawPlugin/${PLUGIN_VERSION} ${process.platform}/${arch}`;
}
const MCP_USER_AGENT = buildUserAgent();
/**
 * MCP JSON-RPC 错误
 *
 * 携带服务端返回的 JSON-RPC error.code，
 * 用于上层按错误码进行差异化处理（如特定错误码触发缓存清理）。
 */
export class McpRpcError extends Error {
    code;
    data;
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = "McpRpcError";
    }
}
/**
 * MCP HTTP 错误
 *
 * 携带 HTTP 状态码，用于精确判断 session 失效（404）等场景，
 * 避免通过字符串匹配 "404" 导致的误判。
 */
export class McpHttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = "McpHttpError";
    }
}
/**
 * 需要清理缓存的 JSON-RPC 错误码集合
 *
 * 当 MCP Server 返回以下错误码时，说明服务端状态已发生变化（如配置变更、
 * 服务重启等），需要清理对应 category 的全部缓存，确保下次请求重新
 * 拉取配置并重建会话。
 *
 * - -32001: 服务不可用（Server Unavailable）
 * - -32002: 配置已变更（Config Changed）
 * - -32003: 认证失败（Auth Failed）
 */
const CACHE_CLEAR_ERROR_CODES = new Set([-32001, -32002, -32003]);
/**
 * 生成多账号感知的缓存 key
 *
 * 不同账号的同一 category 对应不同的 MCP Server（URL、凭据均不同），
 * 必须用 accountId:category 的复合键隔离，避免跨账号缓存污染。
 */
function cacheKey(accountId, category) {
    return `${accountId}:${category}`;
}
/** MCP 配置缓存：accountId:category → response.body（完整配置） */
const mcpConfigCache = new Map();
/** Streamable HTTP 会话缓存：accountId:category → session */
const mcpSessionCache = new Map();
/** 已确认为无状态的 MCP Server 集合（跳过后续握手），key 为 accountId:category */
const statelessCategories = new Set();
/** 正在进行中的 initialize 请求（防止并发重复初始化），key 为 accountId:category */
const inflightInitRequests = new Map();
// ============================================================================
// MCP 配置拉取与缓存
// ============================================================================
/**
 * 判断账户是否为长连接机器人（通过 botId + secret 配置）
 */
function isWebSocketBot(cfg, accountId) {
    const resolved = resolveWeComAccountMulti({ cfg, accountId });
    return Boolean(resolved.botId?.trim() && resolved.secret?.trim());
}
/**
 * 解析用于 MCP 调用的账户 ID
 *
 * 优先级：
 * 1. 默认账户（如果是长连接机器人）
 * 2. 第一个长连接机器人账户
 * 3. 无可用账户时返回 null
 */
function resolveMcpAccountId(cfg) {
    const defaultAccountId = resolveDefaultWeComAccountId(cfg);
    // 优先使用默认账户
    if (isWebSocketBot(cfg, defaultAccountId)) {
        return defaultAccountId;
    }
    // 默认账户非长连接，查找第一个长连接账户
    const allIds = listWeComAccountIds(cfg);
    for (const id of allIds) {
        if (id !== defaultAccountId && isWebSocketBot(cfg, id)) {
            console.log(`${LOG_TAG} 默认账户 "${defaultAccountId}" 非长连接模式，使用账户 "${id}" 获取 MCP 配置`);
            return id;
        }
    }
    return null;
}
/**
 * 根据配置解析当前用于 MCP 的账户 ID
 *
 * 通过 PluginRuntime 读取全局配置，按以下优先级选择账户：
 * 1. 默认账户（如果配置了 botId + secret）
 * 2. 第一个配置了 botId + secret 的长连接账户
 * 3. 无可用长连接账户时回退到默认账户（会导致后续 WSClient 获取失败）
 */
export function resolveCurrentAccountId() {
    try {
        const core = getWeComRuntime();
        const cfg = core.config.loadConfig();
        const mcpAccountId = resolveMcpAccountId(cfg);
        if (mcpAccountId) {
            return mcpAccountId;
        }
        // 无长连接账户，给出友好提示
        console.warn(`${LOG_TAG} 未找到长连接模式的机器人账户（需配置 botId + secret），MCP 功能不可用`);
        return resolveDefaultWeComAccountId(cfg);
    }
    catch {
        // runtime 未初始化时回退到 "default"
        return DEFAULT_ACCOUNT_ID;
    }
}
/**
 * 通过 WSClient 拉取指定 category 的 MCP 完整配置
 *
 * @param accountId - 账户 ID，决定使用哪个 WSClient
 * @param category - MCP 品类名称，如 doc、contact
 * @returns 完整的 response.body 配置对象（至少包含 url 字段）
 */
async function fetchMcpConfig(accountId, category) {
    const wsClient = getWeComWebSocket(accountId);
    if (!wsClient) {
        throw new Error(`WSClient 未连接 (accountId="${accountId}")，无法拉取 MCP 配置`);
    }
    const reqId = generateReqId("mcp_config");
    const response = await withTimeout(wsClient.reply({ headers: { req_id: reqId } }, { biz_type: category, plugin_version: PLUGIN_VERSION }, MCP_GET_CONFIG_CMD), MCP_CONFIG_FETCH_TIMEOUT_MS, `MCP config fetch for "${category}" timed out after ${MCP_CONFIG_FETCH_TIMEOUT_MS}ms`);
    if (response.errcode !== undefined && response.errcode !== 0) {
        const errMsg = `MCP 配置请求失败: errcode=${response.errcode}, errmsg=${response.errmsg ?? "unknown"}`;
        console.error(`${LOG_TAG} ${errMsg}`);
        throw new Error(errMsg);
    }
    const body = response.body;
    if (!body?.url) {
        throw new Error(`MCP 配置响应缺少 url 字段 (category="${category}")`);
    }
    console.log(`${LOG_TAG} 配置拉取成功 (accountId="${accountId}", category="${category}")`);
    return body;
}
/**
 * 获取指定品类的 MCP Server URL
 *
 * 优先从内存缓存中读取，未命中时通过 WSClient 拉取并缓存。
 *
 * @param accountId - 账户 ID
 * @param category - MCP 品类名称
 * @returns MCP Server URL
 */
async function getMcpUrl(accountId, category) {
    const key = cacheKey(accountId, category);
    // 查内存缓存
    const cached = mcpConfigCache.get(key);
    if (cached)
        return cached.url;
    // 缓存未命中，通过 WSClient 拉取
    const body = await fetchMcpConfig(accountId, category);
    // 写入缓存
    mcpConfigCache.set(key, body);
    console.log(`${LOG_TAG} getMcpUrl ${accountId}/${category}: ${body.url}`);
    return body.url;
}
// ============================================================================
// HTTP 底层通信
// ============================================================================
/**
 * 发送原始 HTTP 请求到 MCP Server（底层方法）
 *
 * 自动携带 Mcp-Session-Id 请求头（如果有），
 * 并从响应头中更新 sessionId。
 */
async function sendRawJsonRpc(url, session, body, timeoutMs = HTTP_REQUEST_TIMEOUT_MS, requesterUserId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": MCP_USER_AGENT,
    };
    // Streamable HTTP：携带会话 ID
    if (session.sessionId) {
        headers["Mcp-Session-Id"] = session.sessionId;
    }
    const normalizedRequesterUserId = requesterUserId?.trim();
    if (normalizedRequesterUserId) {
        headers[WECOM_USERID_HEADER] = normalizedRequesterUserId;
    }
    console.log(`${LOG_TAG} sendRawJsonRpc → ${body.method} | ${WECOM_USERID_HEADER}: ${headers[WECOM_USERID_HEADER] ?? "(not set)"}`);
    let response;
    try {
        // 使用 undici 提供的 fetch，规避 Node 18.0–18.17 原生 fetch 无法自定义 User-Agent 的 bug；
        // undici 是项目已有依赖，且在所有支持的 Node 版本上行为一致。
        response = (await undiciFetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        }));
    }
    catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            throw new Error(`MCP 请求超时 (${timeoutMs}ms)`);
        }
        throw new Error(`MCP 网络请求失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally {
        clearTimeout(timeoutId);
    }
    // 从响应头提取新的 sessionId（不直接修改入参，由调用方决定如何更新）
    const newSessionId = response.headers.get("mcp-session-id");
    if (!response.ok) {
        throw new McpHttpError(response.status, `MCP HTTP 请求失败: ${response.status} ${response.statusText}`);
    }
    // Streamable HTTP：notification 响应可能无响应体（204 或 content-length: 0）
    const contentLength = response.headers.get("content-length");
    if (response.status === 204 || contentLength === "0") {
        return { response, rpcResult: undefined, newSessionId };
    }
    const contentType = response.headers.get("content-type") ?? "";
    // 处理 SSE 流式响应
    if (contentType.includes("text/event-stream")) {
        return { response, rpcResult: await parseSseResponse(response), newSessionId };
    }
    // 普通 JSON 响应 — 先读取文本，防止空内容导致 JSON.parse 报错
    const text = await response.text();
    if (!text.trim()) {
        return { response, rpcResult: undefined, newSessionId };
    }
    const rpc = JSON.parse(text);
    if (rpc.error) {
        throw new McpRpcError(rpc.error.code, `MCP 调用错误 [${rpc.error.code}]: ${rpc.error.message}`, rpc.error.data);
    }
    return { response, rpcResult: rpc.result, newSessionId };
}
// ============================================================================
// Session 管理
// ============================================================================
/**
 * 对指定 URL 执行 Streamable HTTP 的 initialize 握手
 *
 * 发送 initialize → 接收 serverInfo → 发送 initialized 通知。
 * 如果服务端未返回 Mcp-Session-Id，则标记为无状态模式，后续请求跳过 session 管理。
 */
async function initializeSession(url, accountId, category, requesterUserId) {
    const key = cacheKey(accountId, category);
    const session = { sessionId: null, initialized: false, stateless: false };
    console.log(`${LOG_TAG} 开始 initialize 握手 (accountId="${accountId}", category="${category}")`);
    // 1. 发送 initialize 请求
    const initBody = {
        jsonrpc: "2.0",
        id: generateReqId("mcp_init"),
        method: "initialize",
        params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "wecom_mcp", version: "1.0.0" },
        },
    };
    const { newSessionId: initSessionId } = await sendRawJsonRpc(url, session, initBody, HTTP_REQUEST_TIMEOUT_MS, requesterUserId);
    // 用返回的 newSessionId 更新 session（不再依赖副作用修改）
    if (initSessionId) {
        session.sessionId = initSessionId;
    }
    // 检查服务端是否返回了 Mcp-Session-Id
    // 如果没有返回，说明该 Server 是无状态实现，无需维护 session
    if (!session.sessionId) {
        session.stateless = true;
        session.initialized = true;
        statelessCategories.add(key);
        mcpSessionCache.set(key, session);
        console.log(`${LOG_TAG} 无状态 Server 确认 (accountId="${accountId}", category="${category}")`);
        return session;
    }
    // 2. 发送 initialized 通知（JSON-RPC notification 不带 id 字段）
    const notifyBody = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
    };
    // initialized 通知不需要等待响应，但 Streamable HTTP 要求通过 POST 发送
    const { newSessionId: notifySessionId } = await sendRawJsonRpc(url, session, notifyBody, HTTP_REQUEST_TIMEOUT_MS, requesterUserId);
    // 如果 initialized 通知的响应也携带了 sessionId，以最新的为准
    if (notifySessionId) {
        session.sessionId = notifySessionId;
    }
    session.initialized = true;
    mcpSessionCache.set(key, session);
    console.log(`${LOG_TAG} 有状态 Session 建立成功 (accountId="${accountId}", category="${category}", sessionId="${session.sessionId}")`);
    return session;
}
/**
 * 获取或创建指定 URL 的 MCP 会话
 *
 * - 已确认无状态的 category：直接返回空 session，跳过握手
 * - 已有可用有状态会话：直接返回缓存
 * - 其他情况：执行 initialize 握手，并发请求会被合并
 */
async function getOrCreateSession(url, accountId, category, requesterUserId) {
    const key = cacheKey(accountId, category);
    // 已确认为无状态的 Server，直接返回空 session 跳过握手
    if (statelessCategories.has(key)) {
        const cached = mcpSessionCache.get(key);
        if (cached)
            return cached;
        // 首次发现被清除（理论上不会走到这里），重新走握手探测
    }
    const cached = mcpSessionCache.get(key);
    if (cached?.initialized)
        return cached;
    // 防止并发重复初始化
    const inflight = inflightInitRequests.get(key);
    if (inflight)
        return inflight;
    const promise = initializeSession(url, accountId, category, requesterUserId).finally(() => {
        inflightInitRequests.delete(key);
    });
    inflightInitRequests.set(key, promise);
    return promise;
}
// ============================================================================
// SSE 解析
// ============================================================================
/**
 * 解析 SSE 流式响应，提取最终的 JSON-RPC result
 *
 * 按照 SSE 规范，同一事件中的多个 `data:` 行会用换行符拼接。
 * 空行分隔不同事件，取最后一个完整事件的数据。
 */
async function parseSseResponse(response) {
    const text = await response.text();
    const lines = text.split("\n");
    // 按 SSE 规范解析：空行分隔事件，同一事件内的 data 行用换行拼接
    let currentDataParts = [];
    let lastEventData = "";
    for (const line of lines) {
        if (line.startsWith("data: ")) {
            currentDataParts.push(line.slice(6));
        }
        else if (line.startsWith("data:")) {
            // data: 后无空格时，值为空字符串
            currentDataParts.push(line.slice(5));
        }
        else if (line.trim() === "" && currentDataParts.length > 0) {
            // 空行表示事件结束，拼接所有 data 行
            lastEventData = currentDataParts.join("\n").trim();
            currentDataParts = [];
        }
    }
    // 处理最后一个未以空行结尾的事件
    if (currentDataParts.length > 0) {
        lastEventData = currentDataParts.join("\n").trim();
    }
    if (!lastEventData) {
        throw new Error("SSE 响应中未包含有效数据");
    }
    try {
        const rpc = JSON.parse(lastEventData);
        if (rpc.error) {
            throw new McpRpcError(rpc.error.code, `MCP 调用错误 [${rpc.error.code}]: ${rpc.error.message}`, rpc.error.data);
        }
        return rpc.result;
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`SSE 响应解析失败: ${lastEventData.slice(0, 200)}`);
        }
        throw err;
    }
}
// ============================================================================
// 公共 API
// ============================================================================
/**
 * 清理指定账户+品类的所有 MCP 缓存（配置、会话、无状态标记）
 *
 * 当 MCP Server 返回特定错误码时调用，确保下次请求重新拉取配置并重建会话。
 *
 * @param accountId - 账户 ID
 * @param category - MCP 品类名称
 */
export function clearCategoryCache(accountId, category) {
    const key = cacheKey(accountId, category);
    console.log(`${LOG_TAG} 清理缓存 (accountId="${accountId}", category="${category}")`);
    mcpConfigCache.delete(key);
    mcpSessionCache.delete(key);
    statelessCategories.delete(key);
    inflightInitRequests.delete(key);
}
/**
 * 清理指定账户下所有品类的 MCP 缓存
 *
 * 适用于账户掉线、凭据变更等需要整体清理的场景。
 *
 * @param accountId - 账户 ID
 */
export function clearAccountCache(accountId) {
    const prefix = `${accountId}:`;
    console.log(`${LOG_TAG} 清理账户所有缓存 (accountId="${accountId}")`);
    for (const key of mcpConfigCache.keys()) {
        if (key.startsWith(prefix))
            mcpConfigCache.delete(key);
    }
    for (const key of mcpSessionCache.keys()) {
        if (key.startsWith(prefix))
            mcpSessionCache.delete(key);
    }
    for (const key of statelessCategories) {
        if (key.startsWith(prefix))
            statelessCategories.delete(key);
    }
    for (const key of inflightInitRequests.keys()) {
        if (key.startsWith(prefix))
            inflightInitRequests.delete(key);
    }
}
/**
 * 发送 JSON-RPC 请求到 MCP Server（Streamable HTTP 协议）
 *
 * 自动管理 session 生命周期：
 * - 无状态 Server：跳过 session 管理，直接发送请求
 * - 有状态 Server：首次调用先执行 initialize 握手，session 失效（404）时自动重建并重试
 *
 * accountId 优先使用 options.accountId（由工具工厂从 ctx.agentAccountId 传入），
 * 未提供时 fallback 到 resolveCurrentAccountId()。解析结果贯穿整条调用链，避免跨账号污染。
 *
 * @param category - MCP 品类名称
 * @param method - JSON-RPC 方法名
 * @param params - JSON-RPC 参数
 * @param options - 可选配置（如自定义超时、指定账户）
 * @returns JSON-RPC result
 */
export async function sendJsonRpc(category, method, params, options) {
    const accountId = options?.accountId?.trim() || resolveCurrentAccountId();
    const key = cacheKey(accountId, category);
    const url = await getMcpUrl(accountId, category);
    const timeoutMs = options?.timeoutMs;
    const requesterUserId = options?.requesterUserId;
    const body = {
        jsonrpc: "2.0",
        id: generateReqId("mcp_rpc"),
        method,
        ...(params !== undefined ? { params } : {}),
    };
    let session = await getOrCreateSession(url, accountId, category, requesterUserId);
    try {
        const { rpcResult, newSessionId } = await sendRawJsonRpc(url, session, body, timeoutMs, requesterUserId);
        // 用最新的 sessionId 更新 session
        if (newSessionId) {
            session.sessionId = newSessionId;
        }
        return rpcResult;
    }
    catch (err) {
        // 特定 JSON-RPC 错误码触发缓存清理（统一在传输层处理，上层无需关心）
        if (err instanceof McpRpcError && CACHE_CLEAR_ERROR_CODES.has(err.code)) {
            clearCategoryCache(accountId, category);
        }
        // 无状态 Server 不存在 session 失效问题，直接抛出错误
        if (session.stateless)
            throw err;
        // 有状态 Server：session 失效时服务端返回 404，需要重新初始化并重试一次
        // 使用 McpHttpError.statusCode 精确匹配，避免字符串匹配 "404" 导致误判
        if (err instanceof McpHttpError && err.statusCode === 404) {
            console.log(`${LOG_TAG} Session 失效 (accountId="${accountId}", category="${category}")，开始重建...`);
            mcpSessionCache.delete(key);
            // 使用 rebuildSession 合并并发的 session 重建请求，避免竞态条件
            session = await rebuildSession(url, accountId, category, requesterUserId);
            const { rpcResult, newSessionId } = await sendRawJsonRpc(url, session, body, timeoutMs, requesterUserId);
            if (newSessionId) {
                session.sessionId = newSessionId;
            }
            return rpcResult;
        }
        // 其他错误记录日志后抛出
        console.error(`${LOG_TAG} RPC 请求失败 (accountId="${accountId}", category="${category}", method="${method}"): ${err instanceof Error ? err.message : String(err)}`);
        throw err;
    }
}
/**
 * 合并并发的 session 重建请求
 *
 * 与 getOrCreateSession 类似，使用 inflightInitRequests 防止
 * 多个并发请求同时遇到 404 时重复执行 initialize 握手。
 */
async function rebuildSession(url, accountId, category, requesterUserId) {
    const key = cacheKey(accountId, category);
    const inflight = inflightInitRequests.get(key);
    if (inflight)
        return inflight;
    const promise = initializeSession(url, accountId, category, requesterUserId).finally(() => {
        inflightInitRequests.delete(key);
    });
    inflightInitRequests.set(key, promise);
    return promise;
}
