/**
 * smartpage_create 请求拦截器
 *
 * 核心逻辑：
 * smartpage_create 的 pages 数组中，每个 page 可能包含 page_filepath 字段
 * （指向本地 markdown 文件），用于避免在命令行传递大段文本内容。
 * 本拦截器在 beforeCall 阶段遍历 pages 数组，逐个读取 page_filepath
 * 指向的本地文件内容，填入 page_content 字段，并移除 page_filepath。
 *
 * 入参约定：
 *   wecom_mcp call doc smartpage_create '{
 *     "title": "主页标题",
 *     "pages": [
 *       {"page_title": "页面1", "page_filepath": "/tmp/page1.md", "content_type": "markdown"},
 *       {"page_title": "页面2", "page_filepath": "/tmp/page2.md", "content_type": "markdown"}
 *     ]
 *   }'
 *
 * 拦截器行为：
 *   1. 检测 args.pages 数组
 *   2. 校验文件大小：单文件不超过 10MB，所有文件总计不超过 20MB
 *   3. 遍历每个 page，若存在 page_filepath 则读取本地文件内容
 *   4. 将文件内容填入 page_content 字段，移除 page_filepath
 *   5. 返回修改后的完整 args
 *
 * 传给 MCP Server 的格式：
 *   { "title": "...", "pages": [{"page_title": "...", "page_content": "...", "content_type": "..."}] }
 */
import type { CallInterceptor } from "./types.js";
export declare const smartpageCreateInterceptor: CallInterceptor;
