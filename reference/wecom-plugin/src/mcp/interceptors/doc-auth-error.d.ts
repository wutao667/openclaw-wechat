/**
 * 文档授权错误拦截器
 *
 * 当 category=doc 的 MCP 调用返回 errcode=851013/851014/851008（文档授权错误）时：
 * 1. 通过 aibot_send_biz_msg 命令向用户发送授权引导卡片
 * 2. 拦截 help_message 内容，不将其传递给 LLM
 * 3. 返回简化响应，告知 LLM 授权卡片已发送、无需再做处理
 */
import type { CallInterceptor } from "./types.js";
export declare const docAuthErrorInterceptor: CallInterceptor;
