"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Synthetic IM target utilities.
 *
 * Some inbound flows (VC meeting-invited, other service-triggered events)
 * do not map to a real IM chat — there is no chat_id / open_id the agent
 * should send messages into. To keep the dispatch pipeline uniform we give
 * these flows a sentinel chatId ("synthetic:<kind>") and teach outbound
 * deliverers to short-circuit whenever they see this prefix. This is the
 * same pattern used by `core/comment-target.ts` for Drive comment threads.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNTHETIC_VC_CHAT_TYPE = exports.SYNTHETIC_VC_CHAT_ID = void 0;
exports.isSyntheticTarget = isSyntheticTarget;
const SYNTHETIC_PREFIX = 'synthetic:';
/** Sentinel chatId for VC `vc.bot.meeting_invited_v1` synthetic inbound. */
exports.SYNTHETIC_VC_CHAT_ID = 'synthetic:vc-invited';
/**
 * The `chatType` stamped on synthetic VC contexts.
 *
 * `MessageContext.chatType` is currently typed as `'p2p' | 'group'` across
 * the plugin and widening that union touches every downstream signature.
 * 'p2p' is the closest match (single-peer, non-group) and the outbound
 * short-circuit gates on the sentinel chatId — not the chatType — so this
 * choice does not produce any DMs on its own.
 *
 * TODO(synthetic-target): widen MessageContext.chatType to include
 * `synthetic` once downstream signatures are audited.
 */
exports.SYNTHETIC_VC_CHAT_TYPE = 'p2p';
/**
 * Return `true` when `target` is a synthetic sentinel that outbound
 * deliverers should not try to send an IM message to.
 */
function isSyntheticTarget(target) {
    return Boolean(target && target.startsWith(SYNTHETIC_PREFIX));
}
