/**
 * 模板卡片管理器
 *
 * 负责：
 * - 模板卡片缓存管理（内存级，带 TTL 和大小限制）
 * - 卡片交互事件处理（更新卡片 UI 状态）
 * - 模板卡片发送（通过 wsClient.sendMessage 主动推送）
 * - 从 LLM 回复中检测并处理模板卡片
 */
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { WSClient, WsFrame, TemplateCard } from "@wecom/aibot-node-sdk";
import type { ResolvedWeComAccount } from "./utils.js";
import type { MessageState, ExtractedTemplateCard } from "./interface.js";
export declare function saveTemplateCardToCache(params: {
    accountId: string;
    templateCard: TemplateCard;
    runtime: RuntimeEnv;
}): void;
export declare function getTemplateCardFromCache(accountId: string, taskId: string): TemplateCard | undefined;
export declare function updateTemplateCardOnEvent(params: {
    frame: WsFrame;
    accountId: string;
    runtime: RuntimeEnv;
    wsClient: WSClient;
}): Promise<void>;
/**
 * 逐个发送已提取的模板卡片（通过 wsClient.sendMessage 主动推送）
 *
 * 发送失败不阻塞流程，仅记录错误日志。
 */
export declare function sendTemplateCards(params: {
    wsClient: WSClient;
    frame: WsFrame;
    state: MessageState;
    account: ResolvedWeComAccount;
    runtime: RuntimeEnv;
    cards: ExtractedTemplateCard[];
}): Promise<void>;
/**
 * 从累积文本中检测并发送模板卡片。
 *
 * 在 finishThinkingStream 之前调用，将卡片处理和流关闭解耦。
 *
 * @returns 移除卡片代码块后的剩余文本（如果没有卡片则返回 null，表示无需修改）
 */
export declare function processTemplateCardsIfNeeded(params: {
    wsClient: WSClient;
    frame: WsFrame;
    state: MessageState;
    account: ResolvedWeComAccount;
    runtime: RuntimeEnv;
}): Promise<{
    remainingText: string;
    cardsDetected: boolean;
} | null>;
