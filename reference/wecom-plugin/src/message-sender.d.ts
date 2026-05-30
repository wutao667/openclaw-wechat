/**
 * 企业微信消息发送模块
 *
 * 负责通过 WSClient 发送回复消息，包含超时保护
 */
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { type WSClient, type WsFrame } from "@wecom/aibot-node-sdk";
/** 流式回复超时错误码（>6分钟未更新，服务端拒绝继续流式更新） */
export declare const STREAM_EXPIRED_ERRCODE = 846608;
/**
 * 流式回复过期错误
 * 当服务端返回 errcode=846608 时抛出，表示流式消息已超过6分钟无法更新，
 * 调用方需降级为主动发送（sendMessage）方式回复。
 */
export declare class StreamExpiredError extends Error {
    readonly errcode = 846608;
    constructor(message?: string);
}
/**
 * 发送企业微信回复消息
 * 供 monitor 内部和 channel outbound 使用
 *
 * @returns messageId (streamId)
 */
export declare function sendWeComReply(params: {
    wsClient: WSClient;
    frame: WsFrame;
    text?: string;
    runtime: RuntimeEnv;
    /** 是否为流式回复的最终消息，默认为 true */
    finish?: boolean;
    /** 指定 streamId，用于流式回复时保持相同的 streamId */
    streamId?: string;
}): Promise<string>;
/**
 * 非阻塞流式文本回复
 *
 * 基于 SDK 的 replyStreamNonBlocking 方法：
 * - 如果上一条同 reqId 的消息尚未收到 ack，则跳过本次发送（返回 'skipped'），
 *   避免流式中间帧排队积压导致延迟。
 * - finish=true 的最终帧不受此限制，始终保证发送。
 *
 * @returns 'skipped' 表示被跳过，否则返回 streamId
 */
export declare function sendWeComReplyNonBlocking(params: {
    wsClient: WSClient;
    frame: WsFrame;
    text: string;
    runtime: RuntimeEnv;
    streamId: string;
    finish?: boolean;
}): Promise<string | 'skipped'>;
