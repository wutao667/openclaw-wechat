/**
 * Webhook 核心消息处理
 *
 * 从 @mocrane/wecom monitor.ts 部分迁移 + 重构。
 * 负责：入站消息解析、防抖聚合、Agent 调度、流式输出、超时兜底。
 */
import type { WecomWebhookTarget, WebhookInboundMessage } from "./types.js";
/**
 * 处理入站消息
 *
 * 解析消息类型和内容，创建/获取 stream，加入防抖队列，返回占位符响应。
 */
export declare function handleInboundMessage(target: WecomWebhookTarget, message: WebhookInboundMessage, timestamp: string, nonce: string, proxyUrl?: string, msgFilterData?: {
    senderUserId?: string;
    chatId?: string;
}): Promise<Record<string, unknown> | null>;
/**
 * 处理 stream_refresh 请求
 *
 * 返回 StreamState 中的当前累积内容、图片附件和 finish 标记。
 */
export declare function handleStreamRefresh(target: WecomWebhookTarget, message: WebhookInboundMessage): Promise<Record<string, unknown> | null>;
/**
 * 处理 enter_chat 事件
 *
 * 返回可配置的欢迎消息。
 */
export declare function handleEnterChat(target: WecomWebhookTarget, message: WebhookInboundMessage): Promise<Record<string, unknown> | null>;
/**
 * 处理模板卡片事件（对齐原版 template_card_event 逻辑）
 *
 * 原版流程：
 * 1. msgid 去重：跳过已处理的卡片事件
 * 2. 解析卡片交互数据：event_key、selected_items、task_id
 * 3. 立即返回空加密回复（非阻塞）
 * 4. 创建 stream 并标记开始
 * 5. 存储 response_url（用于后续推送）
 * 6. 构造交互描述文本，作为文本消息启动 Agent 处理
 */
export declare function handleTemplateCardEvent(target: WecomWebhookTarget, message: WebhookInboundMessage, timestamp: string, nonce: string, proxyUrl?: string): Promise<Record<string, unknown> | null>;
/**
 * **startAgentForStream (启动 Agent 处理流程)**
 *
 * 将接收到的（或聚合的）消息转换为 OpenClaw 内部格式，并分发给对应的 Agent。
 * 包含：
 * 1. 消息解密与媒体保存。
 * 2. 路由解析 (Agent Route)。
 * 3. 会话记录 (Session Recording)。
 * 4. 触发 Agent 响应 (Dispatch Reply)。
 * 5. 处理 Agent 输出（包括文本、Markdown 表格转换、<think> 标签保护、模板卡片识别）。
 */
export declare function startAgentForStream(params: {
    target: WecomWebhookTarget;
    accountId: string;
    msg: WebhookInboundMessage;
    streamId: string;
    mergedContents?: string;
    mergedMsgids?: string[];
}): Promise<void>;
