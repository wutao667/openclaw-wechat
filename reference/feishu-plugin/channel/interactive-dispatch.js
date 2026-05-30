"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Feishu interactive dispatch wrapper.
 *
 * This module adapts Feishu `card.action.trigger` events into OpenClaw's
 * standard interactive dispatch pipeline:
 * - Plugins register via `api.registerInteractiveHandler({ channel, namespace, handler })`
 * - Channel forwards via `dispatchPluginInteractiveHandler()`
 *
 * We intentionally do NOT maintain any channel-local global registry here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchFeishuPluginInteractiveHandler = dispatchFeishuPluginInteractiveHandler;
// NOTE: This is the SDK-standard interactive pipeline.
const plugin_runtime_1 = require("openclaw/plugin-sdk/plugin-runtime");
const card_action_operator_1 = require("../core/card-action-operator.js");
const lark_logger_1 = require("../core/lark-logger.js");
const send_1 = require("../messaging/outbound/send.js");
const log = (0, lark_logger_1.larkLogger)('channel/interactive-dispatch');
function extractBasics(data) {
    try {
        const ev = data;
        const action = ev.action?.value?.action;
        if (!action || typeof action !== 'string')
            return null;
        const openChatId = ev.open_chat_id ?? ev.context?.open_chat_id;
        const openMessageId = ev.open_message_id ?? ev.context?.open_message_id;
        return {
            action: action.trim(),
            senderOpenId: (0, card_action_operator_1.resolveCardCallbackOperatorId)(ev.operator),
            openChatId,
            openMessageId,
        };
    }
    catch {
        return null;
    }
}
function buildMarkdownCard(text) {
    return {
        schema: '2.0',
        body: {
            elements: [
                {
                    tag: 'markdown',
                    content: text,
                },
            ],
        },
    };
}
/**
 * Dispatch a Feishu interactive card action to business plugins through
 * the OpenClaw SDK's standard interactive dispatch pipeline.
 *
 * Returns `undefined` when:
 * - the event does not look like an interactive action we can route, or
 * - no plugin handler is registered for the derived namespace.
 *
 * @param params.cfg - OpenClaw config snapshot.
 * @param params.accountId - Current Feishu account id.
 * @param params.data - Raw `card.action.trigger` event payload.
 */
async function dispatchFeishuPluginInteractiveHandler(params) {
    const basics = extractBasics(params.data);
    if (!basics)
        return undefined;
    if (!basics.action)
        return undefined;
    const respond = {
        reply: async (args) => {
            if (!basics.openChatId || !String(args?.text || '').trim())
                return;
            await (0, send_1.sendMessageFeishu)({
                cfg: params.cfg,
                to: basics.openChatId,
                text: String(args?.text || ''),
                replyToMessageId: basics.openMessageId,
                accountId: params.accountId,
                replyInThread: false,
            });
        },
        followUp: async (args) => {
            if (!basics.openChatId || !String(args?.text || '').trim())
                return;
            await (0, send_1.sendMessageFeishu)({
                cfg: params.cfg,
                to: basics.openChatId,
                text: String(args?.text || ''),
                replyToMessageId: basics.openMessageId,
                accountId: params.accountId,
                replyInThread: false,
            });
        },
        editMessage: async (args) => {
            if (!basics.openMessageId) {
                if (Array.isArray(args?.blocks) && args.blocks.length && basics.openChatId) {
                    await (0, send_1.sendCardFeishu)({
                        cfg: params.cfg,
                        to: basics.openChatId,
                        card: { schema: '2.0', body: { elements: args.blocks } },
                        replyToMessageId: basics.openMessageId,
                        accountId: params.accountId,
                        replyInThread: false,
                    });
                    return;
                }
                if (typeof args?.text === 'string' && args.text.trim() && basics.openChatId) {
                    await (0, send_1.sendMessageFeishu)({
                        cfg: params.cfg,
                        to: basics.openChatId,
                        text: args.text,
                        replyToMessageId: basics.openMessageId,
                        accountId: params.accountId,
                        replyInThread: false,
                    });
                }
                return;
            }
            if (Array.isArray(args?.blocks) && args.blocks.length) {
                await (0, send_1.updateCardFeishu)({
                    cfg: params.cfg,
                    messageId: basics.openMessageId,
                    card: { schema: '2.0', body: { elements: args.blocks } },
                    accountId: params.accountId,
                });
                return;
            }
            if (typeof args?.text === 'string' && args.text.trim()) {
                await (0, send_1.updateCardFeishu)({
                    cfg: params.cfg,
                    messageId: basics.openMessageId,
                    card: buildMarkdownCard(args.text),
                    accountId: params.accountId,
                });
                return;
            }
            await (0, send_1.updateCardFeishu)({
                cfg: params.cfg,
                messageId: basics.openMessageId,
                card: { schema: '2.0', body: { elements: [] } },
                accountId: params.accountId,
            });
        },
    };
    try {
        const dedupeId = `feishu:${params.accountId}:${basics.openChatId ?? '-'}:${basics.openMessageId ?? '-'}:${basics.senderOpenId ?? '-'}:${basics.action}`;
        let cardResponse;
        const result = await (0, plugin_runtime_1.dispatchPluginInteractiveHandler)({
            channel: 'feishu',
            data: basics.action,
            dedupeId,
            invoke: async (match) => {
                const { registration, namespace, payload } = match;
                const handlerCtx = {
                    channel: 'feishu',
                    accountId: params.accountId,
                    senderId: basics.senderOpenId,
                    conversationId: basics.openChatId,
                    messageId: basics.openMessageId,
                    namespace,
                    payload,
                    action: basics.action,
                    rawEvent: params.data,
                    respond,
                };
                cardResponse = await registration.handler(handlerCtx);
                // If the handler returns a card response, treat it as handled.
                return { handled: cardResponse !== undefined };
            },
        });
        if (!result.matched)
            return undefined;
        return cardResponse;
    }
    catch (err) {
        log.warn(`interactive dispatch failed: ${String(err)}`);
        return {
            toast: {
                type: 'error',
                content: '交互处理失败，请稍后重试',
            },
        };
    }
}
