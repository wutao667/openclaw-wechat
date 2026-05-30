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
/** 媒体下载请求超时时间（毫秒），base64 编码的媒体文件最大可达 ~27MB */
export declare const MEDIA_DOWNLOAD_TIMEOUT_MS = 120000;
/** 请求 MCP Server 时透传可信企业微信 userid 的 header 名 */
export declare const WECOM_USERID_HEADER = "x-openclaw-wecom-userid";
/**
 * MCP JSON-RPC 错误
 *
 * 携带服务端返回的 JSON-RPC error.code，
 * 用于上层按错误码进行差异化处理（如特定错误码触发缓存清理）。
 */
export declare class McpRpcError extends Error {
    readonly code: number;
    readonly data?: unknown | undefined;
    constructor(code: number, message: string, data?: unknown | undefined);
}
/**
 * MCP HTTP 错误
 *
 * 携带 HTTP 状态码，用于精确判断 session 失效（404）等场景，
 * 避免通过字符串匹配 "404" 导致的误判。
 */
export declare class McpHttpError extends Error {
    readonly statusCode: number;
    constructor(statusCode: number, message: string);
}
/**
 * 根据配置解析当前用于 MCP 的账户 ID
 *
 * 通过 PluginRuntime 读取全局配置，按以下优先级选择账户：
 * 1. 默认账户（如果配置了 botId + secret）
 * 2. 第一个配置了 botId + secret 的长连接账户
 * 3. 无可用长连接账户时回退到默认账户（会导致后续 WSClient 获取失败）
 */
export declare function resolveCurrentAccountId(): string;
/**
 * 清理指定账户+品类的所有 MCP 缓存（配置、会话、无状态标记）
 *
 * 当 MCP Server 返回特定错误码时调用，确保下次请求重新拉取配置并重建会话。
 *
 * @param accountId - 账户 ID
 * @param category - MCP 品类名称
 */
export declare function clearCategoryCache(accountId: string, category: string): void;
/**
 * 清理指定账户下所有品类的 MCP 缓存
 *
 * 适用于账户掉线、凭据变更等需要整体清理的场景。
 *
 * @param accountId - 账户 ID
 */
export declare function clearAccountCache(accountId: string): void;
/** tools/list 返回的工具描述 */
export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}
/** sendJsonRpc 的可选配置 */
export interface SendJsonRpcOptions {
    /** 自定义 HTTP 请求超时时间（毫秒），默认使用 HTTP_REQUEST_TIMEOUT_MS */
    timeoutMs?: number;
    /** 当前会话可信的企业微信 userid，有值时会注入自定义 header */
    requesterUserId?: string;
    /** 指定使用的账户 ID，有值时优先使用，否则 fallback 到 resolveCurrentAccountId() */
    accountId?: string;
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
export declare function sendJsonRpc(category: string, method: string, params?: Record<string, unknown>, options?: SendJsonRpcOptions): Promise<unknown>;
