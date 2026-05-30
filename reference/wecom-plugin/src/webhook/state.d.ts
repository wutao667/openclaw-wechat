/**
 * Webhook 模式状态管理
 *
 * 从 @mocrane/wecom monitor/state.ts 完整迁移。
 * 包含 StreamStore（流状态存储）、ActiveReplyStore（主动回复地址存储）、MonitorState（全局容器）。
 */
import type { StreamState, PendingInbound, WecomWebhookTarget, WebhookInboundMessage } from "./types.js";
export declare const LIMITS: {
    STREAM_TTL_MS: number;
    ACTIVE_REPLY_TTL_MS: number;
    DEFAULT_DEBOUNCE_MS: number;
    STREAM_MAX_BYTES: number;
    REQUEST_TIMEOUT_MS: number;
};
/**
 * **StreamStore (流状态会话存储)**
 *
 * 管理企业微信回调的流式会话状态、消息去重和防抖聚合逻辑。
 * 负责维护 msgid 到 streamId 的映射，以及临时缓存待处理的 Pending 消息。
 */
export declare class StreamStore {
    private streams;
    private msgidToStreamId;
    private pendingInbounds;
    private conversationState;
    private streamIdToBatchKey;
    private batchStreamIdToAckStreamIds;
    private onFlush?;
    /**
     * **setFlushHandler (设置防抖刷新回调)**
     *
     * 当防抖计时器结束时调用的处理函数。通常用于触发 Agent 进行消息处理。
     * @param handler 回调函数，接收聚合后的 PendingInbound 对象
     */
    setFlushHandler(handler: (pending: PendingInbound) => void): void;
    /**
     * **createStream (创建流会话)**
     *
     * 初始化一个新的流式会话状态。
     * @param params.msgid (可选) 企业微信消息 ID，用于后续去重映射
     * @returns 生成的 streamId (Hex 字符串)
     */
    createStream(params: {
        msgid?: string;
        conversationKey?: string;
        batchKey?: string;
    }): string;
    /**
     * **getStream (获取流状态)**
     *
     * 根据 streamId 获取当前的会话状态。
     * @param streamId 流会话 ID
     */
    getStream(streamId: string): StreamState | undefined;
    /**
     * **getStreamByMsgId (通过 msgid 查找流 ID)**
     *
     * 用于消息去重：检查该 msgid 是否已经关联由正在进行或已完成的流会话。
     * @param msgid 企业微信消息 ID
     */
    getStreamByMsgId(msgid: string): string | undefined;
    /** 手动设置 msgid → streamId 映射 */
    setStreamIdForMsgId(msgid: string, streamId: string): void;
    /**
     * 将“回执流”(ack stream) 关联到某个“批次流”(batch stream)。
     * 用于：当用户连发多条消息被合并排队时，让后续消息的 stream 最终也能更新为可理解的提示，而不是永久停留在“已合并排队…”。
     */
    addAckStreamForBatch(params: {
        batchStreamId: string;
        ackStreamId: string;
    }): void;
    /**
     * 取出并清空某个批次流关联的所有回执流。
     */
    drainAckStreamsForBatch(batchStreamId: string): string[];
    /**
     * **updateStream (更新流状态)**
     *
     * 原子更新流状态，并自动刷新 updatedAt 时间戳。
     * @param streamId 流会话 ID
     * @param mutator 状态修改函数
     */
    updateStream(streamId: string, mutator: (state: StreamState) => void): void;
    /**
     * **markStarted (标记流开始)**
     *
     * 标记该流会话已经开始处理（通常在 Agent 启动后调用）。
     */
    markStarted(streamId: string): void;
    /**
     * **markFinished (标记流结束)**
     *
     * 标记该流会话已完成，不再接收内容更新。
     */
    markFinished(streamId: string): void;
    /**
     * **addPendingMessage (添加待处理消息 / 防抖聚合)**
     *
     * 将收到的消息加入待处理队列。如果相同 pendingKey 已存在，则是防抖聚合；否则创建新条目。
     * 会自动设置或重置防抖定时器。
     *
     * @param params 消息参数
     * @returns { streamId, isNew } isNew=true 表示这是新的一组消息，需初始化 ActiveReply
     */
    addPendingMessage(params: {
        conversationKey: string;
        target: WecomWebhookTarget;
        msg: WebhookInboundMessage;
        msgContent: string;
        nonce: string;
        timestamp: string;
        debounceMs?: number;
    }): {
        streamId: string;
        status: "active_new" | "active_merged" | "queued_new" | "queued_merged";
    };
    /**
     * 请求刷新：如果该批次当前为 active，则立即 flush；否则标记 ready，等待前序批次完成后再 flush。
     */
    private requestFlush;
    /**
     * **flushPending (触发消息处理)**
     *
     * 内部方法：防抖时间结束后，将聚合的消息一次性推送给 flushHandler。
     */
    private flushPending;
    /**
     * 在一个 stream 完成后推进会话队列：将 queued 批次提升为 active，并在需要时触发 flush。
     */
    onStreamFinished(streamId: string): void;
    /**
     * **prune (清理过期状态)**
     *
     * 清理过期的流会话、msgid 映射以及残留的 Pending 消息。
     * @param now 当前时间戳 (毫秒)
     */
    prune(now?: number): void;
}
/**
 * **ActiveReplyStore (主动回复地址存储)**
 *
 * 管理企业微信回调中的 `response_url` (用于被动回复转主动推送) 和 `proxyUrl`。
 * 支持 'once' (一次性) 或 'multi' (多次) 使用策略。
 */
export declare class ActiveReplyStore {
    private policy;
    private activeReplies;
    /**
     * @param policy 使用策略: "once" (默认，销毁式) 或 "multi"
     */
    constructor(policy?: "once" | "multi");
    /**
     * **store (存储回复地址)**
     *
     * 关联 streamId 与 response_url。
     */
    store(streamId: string, responseUrl?: string, proxyUrl?: string): void;
    /**
     * **getUrl (获取回复地址)**
     *
     * 获取指定 streamId 关联的 response_url。
     */
    getUrl(streamId: string): string | undefined;
    /**
     * 获取关联的代理 URL
     */
    getProxyUrl(streamId: string): string | undefined;
    /**
     * **use (消耗回复地址)**
     *
     * 使用存储的 response_url 执行操作。
     * - 如果策略是 "once"，第二次调用会抛错。
     * - 自动更新使用时间 (usedAt)。
     *
     * @param streamId 流会话 ID
     * @param fn 执行函数，接收 { responseUrl, proxyUrl }
     */
    use(streamId: string, fn: (params: {
        responseUrl: string;
        proxyUrl?: string;
    }) => Promise<void>): Promise<void>;
    /**
     * **prune (清理过期地址)**
     *
     * 清理超过 TTL 的 active reply 记录。
     */
    prune(now?: number): void;
}
/**
 * **MonitorState (全局监控状态容器)**
 *
 * 模块单例，统一管理 StreamStore 和 ActiveReplyStore 实例。
 * 提供生命周期方法 (startPruning / stopPruning) 以自动清理过期数据。
 */
export declare class WebhookMonitorState {
    /** 主要的流状态存储 */
    readonly streamStore: StreamStore;
    /** 主动回复地址存储 */
    readonly activeReplyStore: ActiveReplyStore;
    private pruneInterval?;
    /**
     * **startPruning (启动自动清理)**
     *
     * 启动定时器，定期清理过期的流和回复地址。应在插件有活跃 Target 时调用。
     * @param intervalMs 清理间隔 (默认 60s)
     */
    startPruning(intervalMs?: number): void;
    /**
     * **stopPruning (停止自动清理)**
     *
     * 停止定时器。应在插件无活跃 Target 时调用以释放资源。
     */
    stopPruning(): void;
}
/**
 * **monitorState (全局单例)**
 *
 * 导出全局唯一的 MonitorState 实例，供整个应用共享状态。
 */
export declare const monitorState: WebhookMonitorState;
