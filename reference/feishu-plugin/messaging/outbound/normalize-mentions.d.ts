/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Outbound mention normalizer for Feishu post messages. Rewrites <at>
 * tag variants and resolves "@Name" to the canonical
 * <at user_id="ou_xxx">Name</at> form expected by the Feishu API.
 */
import type { LarkAccount } from '../../core/types';
import type { PrincipalKind } from '../inbound/user-name-cache-store';
/**
 * Rewrites <at> tag attribute and quote variants to the canonical
 * `<at user_id="ou_xxx">` form. Idempotent; pure string transform.
 *
 * Recognized variants: `id=`, `open_id=`, `user_id=`; double-quoted,
 * single-quoted, or unquoted; `id=all` aligned to `user_id="all"` with
 * "Everyone" name fill. `<person>` picker tags are left untouched.
 */
export declare function normalizeOutboundMentionsTagPass(text: string): string;
export type LogFn = (...args: unknown[]) => void;
export interface NormalizeContext {
    /** Chat where the message will be sent; keys lazy chat-member fetches. */
    chatId: string;
    account: LarkAccount;
    /** Optional sink for prefetch errors during normalization. */
    log?: LogFn;
}
export interface SentinelEntry {
    name: string;
    reason: 'not_found' | 'ambiguous';
    candidates?: Array<{
        openId: string;
        kind?: PrincipalKind;
    }>;
}
export interface NormalizeResult {
    normalizedText: string;
    sentinels: SentinelEntry[];
}
/**
 * Normalizes outbound text for Feishu: rewrites <at> tag variants and
 * resolves plain "@Name" against the per-account name cache.
 *
 * On cache miss, fetches the chat's bot list and retries; if still
 * unresolved, fetches the chat's member list and retries. Names that
 * match multiple cache entries become ambiguous sentinels for next-turn
 * disambiguation; remaining misses are dropped without a sentinel to
 * avoid false positives on `@` followed by non-name CJK runs.
 */
export declare function normalizeOutboundMentions(text: string, ctx: NormalizeContext): Promise<NormalizeResult>;
