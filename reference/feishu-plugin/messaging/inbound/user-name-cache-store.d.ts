/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped cache registry for Feishu user display names.
 *
 * Stores forward (openId → name + kind) and reverse (normalizedName → Set<openId>)
 * indexes for mention resolution. Per-account, LRU + TTL.
 */
export type PrincipalKind = 'user' | 'bot';
export interface MentionMatch {
    openId: string;
    name: string;
    kind?: PrincipalKind;
}
export interface ChatMember {
    openId: string;
    name: string;
    kind: PrincipalKind;
}
export interface ChatMembersEntry {
    members: ChatMember[];
    expireAt: number;
}
export declare class UserNameCache {
    private nameByOpenId;
    private openIdsByName;
    private maxSize;
    private ttlMs;
    private chatBots;
    private chatMembers;
    private inFlight;
    private maxChats;
    constructor(maxSize?: number, ttlMs?: number, maxChats?: number);
    has(openId: string): boolean;
    get(openId: string): string | undefined;
    set(openId: string, name: string): void;
    setWithKind(openId: string, name: string, kind: PrincipalKind): void;
    lookupByName(name: string): MentionMatch[];
    setMany(entries: Iterable<[string, string]>): void;
    filterMissing(openIds: string[]): string[];
    getMany(openIds: string[]): Map<string, string>;
    recordChatBots(chatId: string, members: Array<{
        openId: string;
        name: string;
    }>): void;
    recordChatMembers(chatId: string, members: ChatMember[]): void;
    getChatBots(chatId: string): ChatMembersEntry | null;
    getChatMembers(chatId: string): ChatMembersEntry | null;
    getInflight(key: string): Promise<void> | undefined;
    setInflight(key: string, promise: Promise<void>): void;
    clearInflight(key: string): void;
    clear(): void;
    private writeEntry;
    private writeEntryNoEvict;
    private deleteOpenId;
    private removeFromReverse;
    private evictChats;
    private evict;
}
export declare function getUserNameCache(accountId: string): UserNameCache;
export declare function clearUserNameCache(accountId?: string): void;
