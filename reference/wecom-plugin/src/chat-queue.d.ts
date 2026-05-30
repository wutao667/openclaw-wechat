type QueueStatus = "queued" | "immediate";
/**
 * 构建队列键
 *
 * 使用 accountId + chatId 作为维度，确保同一会话中的消息串行处理。
 * 不同会话之间互不影响，可以并行处理。
 */
export declare function buildQueueKey(accountId: string, chatId: string): string;
/**
 * 检查指定会话是否有正在处理的任务
 */
export declare function hasActiveTask(key: string): boolean;
/**
 * 将任务加入串行队列
 *
 * 如果队列中已有任务（status="queued"），新任务会排队等待；
 * 如果队列为空（status="immediate"），任务立即执行。
 *
 * 即使前一个任务失败，后续任务仍会继续执行（.then(task, task)）。
 */
export declare function enqueueWeComChatTask(params: {
    accountId: string;
    chatId: string;
    task: () => Promise<void>;
}): {
    status: QueueStatus;
    promise: Promise<void>;
};
/** @internal 测试专用：重置所有队列状态 */
export declare function _resetChatQueueState(): void;
export {};
