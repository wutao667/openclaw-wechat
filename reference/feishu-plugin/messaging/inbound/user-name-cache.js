"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped LRU cache for Feishu user display names.
 *
 * Provides:
 * - `UserNameCache` — per-account LRU Map with TTL
 * - `getUserNameCache(accountId)` — singleton registry
 * - `batchResolveUserNames()` — batch API via `contact/v3/users/batch`
 * - `resolveUserName()` — single-user fallback via `contact.user.get`
 * - `clearUserNameCache()` — teardown hook (called from LarkClient.clearCache)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNameCache = exports.clearUserNameCache = exports.UserNameCache = void 0;
exports.batchResolveUserNames = batchResolveUserNames;
exports.createBatchResolveNames = createBatchResolveNames;
exports.resolveBotName = resolveBotName;
exports.prefetchChatBots = prefetchChatBots;
exports.prefetchChatMembers = prefetchChatMembers;
exports.resolveUserName = resolveUserName;
const lark_client_1 = require("../../core/lark-client.js");
const user_name_cache_store_1 = require("./user-name-cache-store.js");
const permission_1 = require("./permission.js");
var user_name_cache_store_2 = require("./user-name-cache-store.js");
Object.defineProperty(exports, "UserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.UserNameCache; } });
Object.defineProperty(exports, "clearUserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.clearUserNameCache; } });
Object.defineProperty(exports, "getUserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.getUserNameCache; } });
// ---------------------------------------------------------------------------
// Batch resolve via contact/v3/users/batch
// ---------------------------------------------------------------------------
/** Max user_ids per API call (Feishu limit). */
const BATCH_SIZE = 50;
/**
 * Batch-resolve user display names.
 *
 * 1. Check cache → collect misses
 * 2. Deduplicate
 * 3. Call `GET /open-apis/contact/v3/users/batch` in chunks of 50
 * 4. Write results back to cache
 * 5. Return full Map<openId, name> (cache hits + API results)
 *
 * Best-effort: API errors are logged but never thrown.
 */
async function batchResolveUserNames(params) {
    const { account, openIds, log } = params;
    if (!account.configured || openIds.length === 0) {
        return new Map();
    }
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    const result = cache.getMany(openIds);
    // Deduplicate missing IDs
    const missing = [...new Set(cache.filterMissing(openIds))];
    if (missing.length === 0)
        return result;
    const client = lark_client_1.LarkClient.fromAccount(account).sdk;
    // Split into chunks of BATCH_SIZE and call SDK method
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const chunk = missing.slice(i, i + BATCH_SIZE);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await client.contact.user.batch({
                params: {
                    user_ids: chunk,
                    user_id_type: 'open_id',
                },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = res?.data?.items ?? [];
            const resolved = new Set();
            for (const item of items) {
                const openId = item.open_id;
                if (!openId)
                    continue;
                const name = item.name || item.display_name || item.nickname || item.en_name || '';
                cache.setWithKind(openId, name, 'user');
                result.set(openId, name);
                resolved.add(openId);
            }
            // Cache empty names for IDs the API didn't return (no permission, etc.)
            for (const id of chunk) {
                if (!resolved.has(id)) {
                    cache.setWithKind(id, '', 'user');
                    result.set(id, '');
                }
            }
        }
        catch (err) {
            log(`batchResolveUserNames: failed: ${String(err)}`);
        }
    }
    return result;
}
/**
 * Create a `batchResolveNames` callback for use in `ConvertContext`.
 *
 * The returned function calls `batchResolveUserNames` with the given
 * account and log function, populating the TAT user-name cache.
 */
function createBatchResolveNames(account, log) {
    return async (openIds) => {
        await batchResolveUserNames({ account, openIds, log });
    };
}
/**
 * Resolve a single bot's display name via `/open-apis/bot/v3/bots/basic_batch`.
 *
 * Bots are not returned by the contact API, so they have their own endpoint.
 * Names share the same account-scoped cache (keyed by openId) since both
 * bots and users have `ou_` prefixed openIds and a single display name.
 */
async function resolveBotName(params) {
    const { account, openId, log } = params;
    if (!account.configured || !openId)
        return {};
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    if (cache.has(openId))
        return { name: cache.get(openId) ?? '' };
    try {
        const client = lark_client_1.LarkClient.fromAccount(account).sdk;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client.request({
            method: 'GET',
            url: '/open-apis/bot/v3/bots/basic_batch',
            params: { bot_ids: [openId] },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bot = res?.data?.bots?.[openId];
        const name = bot?.name || bot?.i18n_names?.zh_cn || bot?.i18n_names?.en_us || '';
        // Cache even empty names to avoid repeated API calls for bots
        // whose names we cannot resolve.
        cache.setWithKind(openId, name, 'bot');
        return { name: name || undefined };
    }
    catch (err) {
        // Bot name resolution is best-effort: missing `bot:basic_info` scope
        // should not surface as a permission notification to the agent. Log
        // and cache an empty name so we don't retry, then fall back to openId.
        const permErr = (0, permission_1.extractPermissionError)(err);
        if (permErr) {
            log(`feishu: permission error resolving bot name (best-effort, ignored): code=${permErr.code}`);
        }
        else {
            log(`feishu: failed to resolve bot name for ${openId}: ${String(err)}`);
        }
        cache.setWithKind(openId, '', 'bot');
        return {};
    }
}
// ---------------------------------------------------------------------------
// Lazy chat-member prefetch
// ---------------------------------------------------------------------------
/** Returns the numeric Feishu API error code from a thrown error, or null. */
function extractApiCode(err) {
    const permErr = (0, permission_1.extractPermissionError)(err);
    if (typeof permErr?.code === 'number')
        return permErr.code;
    if (err && typeof err === 'object') {
        const code = err.response?.data?.code;
        if (typeof code === 'number')
            return code;
    }
    return null;
}
/**
 * Runs a chat-member prefetch with shared lifecycle:
 *
 * 1. Skip on unconfigured account or empty chatId.
 * 2. Dedup concurrent calls per (tag, chatId) via `cache.inFlight`.
 * 3. Skip when an in-TTL snapshot already exists.
 * 4. On API error, cache an empty list to short-circuit retries; on
 *    transient errors, leave the cache untouched so the next call retries.
 */
async function runChatPrefetch(spec, account, chatId, log) {
    if (!account.configured || !chatId)
        return;
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    const key = `${spec.tag}:${chatId}`;
    const existing = cache.getInflight(key);
    if (existing)
        return existing;
    if (spec.isFresh(cache, chatId))
        return;
    const promise = (async () => {
        try {
            const client = lark_client_1.LarkClient.fromAccount(account).sdk;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await client.request({
                method: 'GET',
                url: spec.url(chatId),
                params: spec.params,
            });
            const items = res?.data?.items ?? [];
            const members = items.map(spec.parseItem).filter((m) => m !== null);
            spec.record(cache, chatId, members);
        }
        catch (err) {
            const apiCode = extractApiCode(err);
            if (apiCode != null) {
                // Application-level refusal: cache an empty list to short-circuit
                // further retries. Persistent errors (e.g. missing scope) will not
                // resolve within the cache TTL anyway.
                log(`prefetchChat${spec.tag}[${chatId}]: API error code=${apiCode}, caching empty`);
                spec.record(cache, chatId, []);
            }
            else {
                log(`prefetchChat${spec.tag}[${chatId}]: failed: ${String(err)}`);
            }
        }
        finally {
            cache.clearInflight(key);
        }
    })();
    cache.setInflight(key, promise);
    return promise;
}
const CHAT_BOTS_SPEC = {
    tag: 'Bots',
    url: (chatId) => `/open-apis/im/v1/chats/${chatId}/members/bots`,
    params: {},
    parseItem: (raw) => {
        const it = raw;
        const openId = String(it.bot_id ?? it.open_id ?? '');
        if (!openId)
            return null;
        return { openId, name: String(it.bot_name ?? it.name ?? '') };
    },
    isFresh: (cache, chatId) => cache.getChatBots(chatId) !== null,
    record: (cache, chatId, members) => cache.recordChatBots(chatId, members),
};
function memberTypeToKind(type) {
    return type === 'app' ? 'bot' : 'user';
}
const CHAT_MEMBERS_SPEC = {
    tag: 'Members',
    url: (chatId) => `/open-apis/im/v1/chats/${chatId}/members`,
    params: { member_id_type: 'open_id', page_size: 100 },
    parseItem: (raw) => {
        const it = raw;
        const openId = String(it.member_id ?? it.open_id ?? '');
        if (!openId)
            return null;
        return { openId, name: String(it.name ?? ''), kind: memberTypeToKind(it.member_type) };
    },
    isFresh: (cache, chatId) => cache.getChatMembers(chatId) !== null,
    record: (cache, chatId, members) => cache.recordChatMembers(chatId, members),
};
/**
 * Fetches the bot members of a chat via
 * `GET /open-apis/im/v1/chats/{chat_id}/members/bots` and writes them
 * to the per-account cache.
 */
async function prefetchChatBots(account, chatId, log) {
    return runChatPrefetch(CHAT_BOTS_SPEC, account, chatId, log);
}
/**
 * Fetches the human members of a chat via
 * `GET /open-apis/im/v1/chats/{chat_id}/members` and writes them to
 * the per-account cache.
 */
async function prefetchChatMembers(account, chatId, log) {
    return runChatPrefetch(CHAT_MEMBERS_SPEC, account, chatId, log);
}
/**
 * Resolve a single user's display name.
 *
 * Checks the account-scoped cache first, then falls back to the
 * `contact.user.get` API (same as the old `resolveFeishuSenderName`).
 */
async function resolveUserName(params) {
    const { account, openId, log } = params;
    if (!account.configured || !openId)
        return {};
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    if (cache.has(openId))
        return { name: cache.get(openId) ?? '' };
    try {
        const client = lark_client_1.LarkClient.fromAccount(account).sdk;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client.contact.user.get({
            path: { user_id: openId },
            params: { user_id_type: 'open_id' },
        });
        const name = res?.data?.user?.name ||
            res?.data?.user?.display_name ||
            res?.data?.user?.nickname ||
            res?.data?.user?.en_name ||
            '';
        // Cache even empty names to avoid repeated API calls for users
        // whose names we cannot resolve (e.g. due to permissions).
        cache.setWithKind(openId, name, 'user');
        return { name: name || undefined };
    }
    catch (err) {
        const permErr = (0, permission_1.extractPermissionError)(err);
        if (permErr) {
            log(`feishu: permission error resolving user name: code=${permErr.code}`);
            // Cache empty name so we don't retry a known-failing openId
            cache.setWithKind(openId, '', 'user');
            return { permissionError: permErr };
        }
        log(`feishu: failed to resolve user name for ${openId}: ${String(err)}`);
        return {};
    }
}
