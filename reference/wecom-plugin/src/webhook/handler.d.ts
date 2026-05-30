/**
 * Webhook HTTP 请求处理
 *
 * 从 @mocrane/wecom monitor.ts handleWecomWebhookRequest 部分迁移 + 重构。
 * 负责：
 * 1. GET/POST 请求分流
 * 2. 签名验证（调用 crypto 模块）
 * 3. 消息解密
 * 4. 按消息类型分发到 monitor 层
 */
import type { IncomingMessage, ServerResponse } from "node:http";
/**
 * Webhook HTTP 请求总入口
 *
 * 处理企微 Bot Webhook 的 GET（URL 验证）和 POST（消息回调）请求。
 * 返回 true 表示已处理，false 表示不匹配（交给其他 handler）。
 */
export declare function handleWecomWebhookRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
