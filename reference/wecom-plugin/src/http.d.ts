/**
 * **WecomHttpOptions (HTTP 选项)**
 *
 * @property proxyUrl 代理服务器地址
 * @property timeoutMs 请求超时时间 (毫秒)
 * @property signal AbortSignal 信号
 */
export type WecomHttpOptions = {
    proxyUrl?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
};
/**
 * **wecomFetch (统一 HTTP 请求)**
 *
 * 基于 `undici` 的 fetch 封装，自动处理 ProxyAgent 和 Timeout。
 * 所有对企业微信 API 的调用都应经过此函数。
 */
export declare function wecomFetch(input: string | URL, init?: RequestInit, opts?: WecomHttpOptions): Promise<Response>;
/**
 * **readResponseBodyAsBuffer (读取响应 Body)**
 *
 * 将 Response Body 读取为 Buffer，支持最大字节限制以防止内存溢出。
 * 适用于下载媒体文件等场景。
 */
export declare function readResponseBodyAsBuffer(res: Response, maxBytes?: number): Promise<Buffer>;
