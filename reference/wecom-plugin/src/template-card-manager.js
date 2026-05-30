/**
 * 模板卡片管理器
 *
 * 负责：
 * - 模板卡片缓存管理（内存级，带 TTL 和大小限制）
 * - 卡片交互事件处理（更新卡片 UI 状态）
 * - 模板卡片发送（通过 wsClient.sendMessage 主动推送）
 * - 从 LLM 回复中检测并处理模板卡片
 */
import { extractTemplateCards } from "./template-card-parser.js";
import { TEMPLATE_CARD_CACHE_TTL_MS, TEMPLATE_CARD_CACHE_MAX_SIZE, } from "./const.js";
const sentTemplateCardByTaskId = new Map();
function getTemplateCardCacheKey(accountId, taskId) {
    return `${accountId}:${taskId}`;
}
function pruneTemplateCardCache() {
    const now = Date.now();
    for (const [key, entry] of sentTemplateCardByTaskId) {
        if (now - entry.createdAt >= TEMPLATE_CARD_CACHE_TTL_MS) {
            sentTemplateCardByTaskId.delete(key);
        }
    }
    if (sentTemplateCardByTaskId.size <= TEMPLATE_CARD_CACHE_MAX_SIZE) {
        return;
    }
    const sortedEntries = [...sentTemplateCardByTaskId.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const removeCount = sentTemplateCardByTaskId.size - TEMPLATE_CARD_CACHE_MAX_SIZE;
    for (const [key] of sortedEntries.slice(0, removeCount)) {
        sentTemplateCardByTaskId.delete(key);
    }
}
function cloneTemplateCard(card) {
    return JSON.parse(JSON.stringify(card));
}
export function saveTemplateCardToCache(params) {
    const { accountId, templateCard, runtime } = params;
    const taskId = templateCard.task_id;
    if (!taskId) {
        runtime.log?.("[wecom][template-card] Skip cache: template card has no task_id");
        return;
    }
    sentTemplateCardByTaskId.set(getTemplateCardCacheKey(accountId, taskId), {
        templateCard: cloneTemplateCard(templateCard),
        createdAt: Date.now(),
    });
    pruneTemplateCardCache();
}
export function getTemplateCardFromCache(accountId, taskId) {
    pruneTemplateCardCache();
    const cached = sentTemplateCardByTaskId.get(getTemplateCardCacheKey(accountId, taskId));
    if (!cached) {
        return undefined;
    }
    return cloneTemplateCard(cached.templateCard);
}
function buildSelectedOptionMap(templateCardEvent) {
    const selectedMap = new Map();
    const selectedItems = templateCardEvent?.selected_items?.selected_item ?? [];
    for (const item of selectedItems) {
        const questionKey = item.question_key?.trim();
        if (!questionKey) {
            continue;
        }
        const optionIds = item.option_ids?.option_id?.filter(Boolean) ?? [];
        selectedMap.set(questionKey, optionIds);
    }
    return selectedMap;
}
function applySelectedStateToTemplateCard(params) {
    const { templateCard, selectedMap, templateCardEvent } = params;
    const nextCard = cloneTemplateCard(templateCard);
    if (templateCardEvent?.task_id) {
        nextCard.task_id = templateCardEvent.task_id;
    }
    if (templateCardEvent?.card_type) {
        nextCard.card_type = templateCardEvent.card_type;
    }
    if (nextCard.submit_button?.text) {
        nextCard.submit_button.text = "已提交";
    }
    if (nextCard.checkbox?.question_key) {
        const selectedIds = selectedMap.get(nextCard.checkbox.question_key) ?? [];
        nextCard.checkbox.disable = true;
        if (Array.isArray(nextCard.checkbox.option_list)) {
            nextCard.checkbox.option_list = nextCard.checkbox.option_list.map((option) => ({
                ...option,
                is_checked: selectedIds.includes(option.id),
            }));
        }
    }
    if (Array.isArray(nextCard.select_list)) {
        nextCard.select_list = nextCard.select_list.map((selection) => {
            const selectedIds = selectedMap.get(selection.question_key) ?? [];
            return {
                ...selection,
                disable: true,
                selected_id: selectedIds[0] ?? selection.selected_id,
            };
        });
    }
    if (nextCard.button_selection?.question_key) {
        const selectedIds = selectedMap.get(nextCard.button_selection.question_key) ?? [];
        nextCard.button_selection.disable = true;
        if (selectedIds[0]) {
            nextCard.button_selection.selected_id = selectedIds[0];
        }
    }
    return nextCard;
}
export async function updateTemplateCardOnEvent(params) {
    const { frame, accountId, runtime, wsClient } = params;
    const body = frame.body;
    const templateCardEvent = body.event?.template_card_event;
    const taskId = templateCardEvent?.task_id;
    if (!taskId) {
        runtime.log?.(`[${accountId}] [template-card-update] Skip update: missing task_id in callback`);
        return;
    }
    const cachedCard = getTemplateCardFromCache(accountId, taskId);
    if (!cachedCard) {
        runtime.log?.(`[${accountId}] [template-card-update] Skip update: task_id=${taskId} not found in cache (cache is in-memory only, may have been cleared after restart)`);
        return;
    }
    const selectedMap = buildSelectedOptionMap(templateCardEvent);
    const updatedCard = applySelectedStateToTemplateCard({
        templateCard: cachedCard,
        selectedMap,
        templateCardEvent,
    });
    await wsClient.updateTemplateCard(frame, updatedCard, [body.from.userid]);
    runtime.log?.(`[${accountId}] [template-card-update] Updated card by task_id=${taskId}`);
    saveTemplateCardToCache({
        accountId,
        templateCard: updatedCard,
        runtime,
    });
}
// ============================================================================
// 模板卡片发送
// ============================================================================
/**
 * 逐个发送已提取的模板卡片（通过 wsClient.sendMessage 主动推送）
 *
 * 发送失败不阻塞流程，仅记录错误日志。
 */
export async function sendTemplateCards(params) {
    const { wsClient, frame, state, runtime, account, cards } = params;
    const body = frame.body;
    const chatId = body.chatid || body.from.userid;
    for (const card of cards) {
        try {
            runtime.log?.(`[wecom][template-card] Sending card_type=${card.cardType} to chatId=${chatId}`);
            const rawTemplateCard = card.cardJson;
            if (typeof rawTemplateCard.card_type !== "string") {
                runtime.error?.("[wecom][template-card] Skip sending invalid card: missing card_type");
                continue;
            }
            const templateCard = rawTemplateCard;
            await wsClient.sendMessage(chatId, {
                msgtype: "template_card",
                template_card: templateCard,
            });
            state.hasTemplateCard = true;
            saveTemplateCardToCache({
                accountId: account.accountId,
                templateCard,
                runtime,
            });
            runtime.log?.(`[wecom][template-card] Card sent successfully: card_type=${card.cardType}`);
        }
        catch (err) {
            runtime.error?.(`[wecom][template-card] Failed to send card: card_type=${card.cardType}, error=${JSON.stringify(err)}`);
        }
    }
}
// ============================================================================
// 模板卡片检测与处理（从 finishThinkingStream 中分离）
// ============================================================================
/**
 * 从累积文本中检测并发送模板卡片。
 *
 * 在 finishThinkingStream 之前调用，将卡片处理和流关闭解耦。
 *
 * @returns 移除卡片代码块后的剩余文本（如果没有卡片则返回 null，表示无需修改）
 */
export async function processTemplateCardsIfNeeded(params) {
    const { state, runtime } = params;
    const visibleText = state.accumulatedText?.trim();
    if (!visibleText) {
        runtime.log?.(`[wecom][template-card] processTemplateCardsIfNeeded: no visibleText, skipping`);
        return null;
    }
    runtime.log?.(`[wecom][template-card] processTemplateCardsIfNeeded: visibleText exists, length=${visibleText.length}, running extractTemplateCards...`);
    const logFn = (...args) => {
        runtime.log?.(...args);
    };
    const { cards, remainingText } = extractTemplateCards(state.accumulatedText, logFn);
    runtime.log?.(`[wecom][template-card] processTemplateCardsIfNeeded: extractTemplateCards result — cards=${cards.length}, remainingTextLength=${remainingText.length}`);
    if (cards.length === 0) {
        return null;
    }
    runtime.log?.(`[wecom][template-card] processTemplateCardsIfNeeded: ${cards.length} card(s) detected, card_types=[${cards.map(c => c.cardType).join(", ")}]`);
    await sendTemplateCards({ ...params, cards });
    return { remainingText, cardsDetected: true };
}
