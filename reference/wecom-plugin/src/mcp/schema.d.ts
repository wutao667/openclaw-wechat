/**
 * MCP Schema 清洗模块
 *
 * 负责内联 $ref/$defs 引用并移除 Gemini 不支持的 JSON Schema 关键词，
 * 防止 Gemini 模型解析 function response 时报 400 错误。
 */
/**
 * 清洗 JSON Schema，内联 $ref 引用并移除 Gemini 不支持的关键词，
 * 防止 Gemini 模型解析 function response 时报 400 错误。
 */
export declare function cleanSchemaForGemini(schema: unknown): unknown;
