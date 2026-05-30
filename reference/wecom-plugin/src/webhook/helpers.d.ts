/**
 * Webhook 辅助函数
 *
 * 从 @mocrane/wecom monitor.ts 迁移的辅助工具函数集合。
 * 包含：文本截断、兜底提示构建、本机路径提取、MIME 推断等。
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { StreamState, WecomWebhookTarget, WebhookInboundMessage, WebhookInboundQuote } from "./types.js";
/** DM 文本最大字节数上限 */
export declare const STREAM_MAX_DM_BYTES = 200000;
/** MIME 扩展名映射表 */
export declare const MIME_BY_EXT: Record<string, string>;
/**
 * UTF-8 字节截断（保留尾部，截断头部）
 *
 * 对齐原版 truncateUtf8Bytes：保留最后 maxBytes 字节。
 */
export declare function truncateUtf8Bytes(text: string, maxBytes: number): string;
/**
 * 追加 DM 兜底内容（对齐原版 appendDmContent）
 *
 * 每次 deliver 时都追加到 dmContent（不受 STREAM_MAX_BYTES 限制，有 DM 上限保护）
 */
export declare function appendDmContent(state: StreamState, text: string): void;
/**
 * 构建兜底提示文本（对齐原版 buildFallbackPrompt）
 */
export declare function buildFallbackPrompt(params: {
    kind: "media" | "timeout" | "error";
    agentConfigured: boolean;
    userId?: string;
    filename?: string;
    chatType?: "group" | "direct";
}): string;
/**
 * 从文本中提取本机文件路径（对齐原版 extractLocalFilePathsFromText）
 */
export declare function extractLocalFilePathsFromText(text: string): string[];
/**
 * 从文本中提取本机图片路径（对齐原版 extractLocalImagePathsFromText）
 *
 * 仅提取 text 中存在且也出现在 mustAlsoAppearIn 中的路径（安全：防止泄漏）
 */
export declare function extractLocalImagePathsFromText(params: {
    text: string;
    mustAlsoAppearIn: string;
}): string[];
/**
 * 判断文本是否包含"发送本机文件"的意图（对齐原版 looksLikeSendLocalFileIntent）
 */
export declare function looksLikeSendLocalFileIntent(rawBody: string): boolean;
/**
 * 计算 taskKey（对齐原版 computeTaskKey）
 */
export declare function computeTaskKey(target: WecomWebhookTarget, msg: WebhookInboundMessage): string | undefined;
/**
 * 检查 Agent 凭证是否已配置（对齐原版 resolveAgentAccountOrUndefined 的简化版）
 *
 * 在 webhook 模式下，Agent 凭证直接来自 target.account，不需要复杂的解析
 */
export declare function isAgentConfigured(target: WecomWebhookTarget): boolean;
/**
 * 从路径猜测 content-type
 */
export declare function guessContentTypeFromPath(filePath: string): string | undefined;
/**
 * 从 StreamState 构建最终流式回复（对齐原版 buildStreamReplyFromState）
 *
 * 包含 images/msg_item，对 content 做 truncateUtf8Bytes。
 */
export declare function buildStreamReplyFromState(state: StreamState, maxBytes: number): Record<string, unknown>;
/**
 * 计算 MD5
 */
export declare function computeMd5(data: Buffer | string): string;
/**
 * 解析媒体最大字节数（对齐原版 resolveWecomMediaMaxBytes）
 */
export declare function resolveWecomMediaMaxBytes(cfg: OpenClawConfig): number;
/** 入站消息解析结果（对齐原版 InboundResult） */
export type InboundResult = {
    body: string;
    media?: {
        buffer: Buffer;
        contentType: string;
        filename: string;
    };
};
/**
 * 处理接收消息（对齐原版 processInboundMessage）
 *
 * 解析企业微信传入的消息体：
 * 1. 识别媒体消息（Image/File/Video/Mixed）
 * 2. 如果存在媒体文件，调用 media.ts 进行解密和下载
 * 3. 通过 inferInboundMediaMeta 精确推断 MIME 和文件名
 * 4. 构造统一的 InboundResult 供后续 Agent 处理
 *
 * @param target Webhook 目标配置
 * @param msg 企业微信原始消息对象
 */
export declare function processInboundMessage(target: WecomWebhookTarget, msg: WebhookInboundMessage): Promise<InboundResult>;
/**
 * 构建 Agent 调度所需的 config（对齐原版 cfgForDispatch 逻辑）
 *
 * 关键修改：
 * - tools.deny += "message"（防止 Agent 绕过 Bot 交付）
 * - blockStreamingChunk / blockStreamingCoalesce 使用更小的阈值
 */
export declare function buildCfgForDispatch(config: OpenClawConfig): OpenClawConfig;
/**
 * 解析企微 Bot 回调中的发送者 userid（对齐原版 resolveWecomSenderUserId）
 *
 * 优先级：from.userid → fromuserid → from_userid → fromUserId
 */
export declare function resolveWecomSenderUserId(msg: WebhookInboundMessage): string | undefined;
/**
 * 构造入站消息文本内容（对齐原版 buildInboundBody）
 *
 * 根据消息类型提取文本表示：
 * - text → text.content
 * - voice → voice.content 或 "[voice]"
 * - image → "[image] {url}"
 * - file → "[file] {url}"
 * - video → "[video] {url}"
 * - mixed → 逐项提取拼接
 * - event → "[event] {eventtype}"
 * - stream → "[stream_refresh] {id}"
 *
 * 如果消息包含 quote（引用），追加引用内容。
 */
export declare function buildInboundBody(msg: WebhookInboundMessage): string;
/**
 * 格式化引用消息文本（对齐原版 formatQuote）
 */
export declare function formatQuote(quote: WebhookInboundQuote): string;
/** 检查消息是否有媒体内容 */
export declare function hasMedia(message: WebhookInboundMessage): boolean;
/**
 * 构造占位符响应（对齐原版 buildStreamPlaceholderReply）
 *
 * 用于 active_new / queued_new 场景：finish=false，显示占位符文本。
 * 原版规范：第一次回复内容为 "1" 作为最小占位符。
 */
export declare function buildStreamPlaceholderReply(streamId: string, placeholderContent?: string): Record<string, unknown>;
/**
 * 构造文本占位符响应（对齐原版 buildStreamTextPlaceholderReply）
 *
 * 用于 merged 场景：finish=false，显示自定义提示（如"已合并排队处理中..."）。
 */
export declare function buildStreamTextPlaceholderReply(streamId: string, content: string): Record<string, unknown>;
/**
 * 构造流式响应（从 StreamState 构建）
 *
 * 用于 stream_refresh 和 msgid 去重场景：返回当前累积内容 + finish 标记。
 */
export declare function buildStreamResponse(stream: StreamState): Record<string, unknown>;
