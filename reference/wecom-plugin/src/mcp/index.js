/**
 * MCP 模块统一导出
 */
export { createWeComMcpTool } from "./tool.js";
export { sendJsonRpc, clearCategoryCache, clearAccountCache, resolveCurrentAccountId, McpRpcError, McpHttpError } from "./transport.js";
export { cleanSchemaForGemini } from "./schema.js";
// 注意：parseSessionKeyChat 已废弃不再导出。
//   OpenClaw core 构建 sessionKey 时会把 chatId 小写化，
//   企业微信接口（如 aibot_send_biz_msg）是大小写敏感的，反解结果不可用。
//   chatId 请通过 state-manager 的 getSessionChatInfo(sessionKey) 获取。
