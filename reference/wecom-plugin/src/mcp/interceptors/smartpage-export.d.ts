/**
 * smartpage_get_export_result 响应拦截器
 *
 * 核心逻辑：
 * MCP Server 返回的 smartpage_get_export_result 响应中，当 task_done=true 时
 * 会包含 content 字段（markdown 文本内容）。该内容可能很大，直接返回给 LLM
 * 会消耗大量 token。
 *
 * 本拦截器在 afterCall 阶段：
 * 1. 检测 task_done=true 且存在 content 字段
 * 2. 将 content 保存到本地文件（使用与 msg-media 一致的媒体目录）
 * 3. 用 content_path（文件路径）替换 content 字段
 *
 * 这样 LLM 只看到轻量的文件路径信息，Skill 可通过文件路径读取完整内容。
 */
import type { CallInterceptor } from "./types.js";
export declare const smartpageExportInterceptor: CallInterceptor;
