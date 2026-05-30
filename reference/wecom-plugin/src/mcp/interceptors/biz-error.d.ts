/**
 * 业务错误码检查拦截器
 *
 * 检查 tools/call 返回结果中是否包含需要清理缓存的业务错误码。
 * MCP Server 可能在正常的 JSON-RPC 响应中返回业务层错误，
 * 这些错误被包裹在 result.content[].text 中，需要解析后判断。
 *
 * 此拦截器对所有 call 调用生效。
 */
import type { CallInterceptor } from "./types.js";
export declare const bizErrorInterceptor: CallInterceptor;
