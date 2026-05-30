/**
 * 企业微信全局状态管理模块
 *
 * 负责管理 WSClient 实例、消息状态（带 TTL 清理）、ReqId 存储
 * 解决全局 Map 的内存泄漏问题
 */
import { createPersistentReqIdStore } from "./reqid-store.js";
import { MESSAGE_STATE_TTL_MS, MESSAGE_STATE_CLEANUP_INTERVAL_MS, MESSAGE_STATE_MAX_SIZE, GLOBAL_WS_CLIENT_KEY, } from "./const.js";
// ============================================================================
// 全局单例状态（通过 globalThis + Symbol.for 确保跨 jiti loader 实例共享）
//
// 问题背景：openclaw 框架在不同阶段（主加载、configSchema 加载等）会创建
// 多个独立的 jiti loader 实例，每个实例有独立的模块缓存（parentCache），
// 导致本模块被多次实例化，模块级变量不共享。
// 使用 globalThis + Symbol.for 可以确保同一进程内只有一份状态。
// ============================================================================
/** 全局共享状态的唯一键 */
const SHARED_STATE_KEY = Symbol.for("wecom-openclaw-plugin:shared-state:v1");
/**
 * 获取或创建全局共享状态（进程内单例）
 */
function getSharedState() {
    const existing = globalThis[SHARED_STATE_KEY];
    if (existing)
        return existing;
    const state = {
        wsClientInstances: new Map(),
        messageStates: new Map(),
        cleanupTimer: null,
        reqIdStores: new Map(),
    };
    globalThis[SHARED_STATE_KEY] = state;
    return state;
}
/** 进程内唯一的共享状态 */
const shared = getSharedState();
// ============================================================================
// WSClient 实例管理
// ============================================================================
/** WSClient 实例管理 */
const wsClientInstances = (globalThis[GLOBAL_WS_CLIENT_KEY]
    ?? (globalThis[GLOBAL_WS_CLIENT_KEY] = new Map()));
/**
 * 获取指定账户的 WSClient 实例
 */
export function getWeComWebSocket(accountId) {
    return shared.wsClientInstances.get(accountId) ?? null;
}
/**
 * 设置指定账户的 WSClient 实例
 */
export function setWeComWebSocket(accountId, client) {
    shared.wsClientInstances.set(accountId, client);
}
/**
 * 删除指定账户的 WSClient 实例
 */
export function deleteWeComWebSocket(accountId) {
    shared.wsClientInstances.delete(accountId);
}
// ============================================================================
// 消息状态管理（带 TTL 清理，防止内存泄漏）
// ============================================================================
// MessageStateEntry 接口已在上方 SharedState 定义处声明
/**
 * 启动消息状态定期清理（自动 TTL 清理 + 容量限制）
 */
export function startMessageStateCleanup() {
    if (shared.cleanupTimer)
        return;
    shared.cleanupTimer = setInterval(() => {
        pruneMessageStates();
    }, MESSAGE_STATE_CLEANUP_INTERVAL_MS);
    // 允许进程退出时不阻塞
    if (shared.cleanupTimer && typeof shared.cleanupTimer === "object" && "unref" in shared.cleanupTimer) {
        shared.cleanupTimer.unref();
    }
}
/**
 * 停止消息状态定期清理
 */
export function stopMessageStateCleanup() {
    if (shared.cleanupTimer) {
        clearInterval(shared.cleanupTimer);
        shared.cleanupTimer = null;
    }
}
/**
 * 清理过期和超量的消息状态条目
 */
function pruneMessageStates() {
    const now = Date.now();
    // 1. 清理过期条目
    for (const [key, entry] of shared.messageStates) {
        if (now - entry.createdAt >= MESSAGE_STATE_TTL_MS) {
            shared.messageStates.delete(key);
        }
    }
    // 2. 容量限制：如果仍超过最大条目数，按时间淘汰最旧的
    if (shared.messageStates.size > MESSAGE_STATE_MAX_SIZE) {
        const sorted = [...shared.messageStates.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
        const toRemove = sorted.slice(0, shared.messageStates.size - MESSAGE_STATE_MAX_SIZE);
        for (const [key] of toRemove) {
            shared.messageStates.delete(key);
        }
    }
}
/**
 * 设置消息状态
 */
export function setMessageState(messageId, state) {
    shared.messageStates.set(messageId, {
        state,
        createdAt: Date.now(),
    });
}
/**
 * 获取消息状态
 */
export function getMessageState(messageId) {
    const entry = shared.messageStates.get(messageId);
    if (!entry)
        return undefined;
    // 检查 TTL
    if (Date.now() - entry.createdAt >= MESSAGE_STATE_TTL_MS) {
        shared.messageStates.delete(messageId);
        return undefined;
    }
    return entry.state;
}
/**
 * 删除消息状态
 */
export function deleteMessageState(messageId) {
    shared.messageStates.delete(messageId);
}
/**
 * 清空所有消息状态
 */
export function clearAllMessageStates() {
    shared.messageStates.clear();
}
// ============================================================================
// ReqId 持久化存储管理（按 accountId 隔离）
// ============================================================================
/**
 * ReqId 持久化存储管理
 * 参考 createPersistentDedupe 模式：内存 + 磁盘双层、文件锁、原子写入、TTL 过期、防抖写入
 * 重启后可从磁盘恢复，确保主动推送消息时能获取到 reqId
 */
function getOrCreateReqIdStore(accountId) {
    let store = shared.reqIdStores.get(accountId);
    if (!store) {
        store = createPersistentReqIdStore(accountId);
        shared.reqIdStores.set(accountId, store);
    }
    return store;
}
// ============================================================================
// ReqId 操作函数
// ============================================================================
/**
 * 设置 chatId 对应的 reqId（写入内存 + 防抖写磁盘）
 */
export function setReqIdForChat(chatId, reqId, accountId = "default") {
    getOrCreateReqIdStore(accountId).set(chatId, reqId);
}
/**
 * 获取 chatId 对应的 reqId（异步：优先内存，miss 时查磁盘并回填内存）
 */
export async function getReqIdForChatAsync(chatId, accountId = "default") {
    return getOrCreateReqIdStore(accountId).get(chatId);
}
/**
 * 获取 chatId 对应的 reqId（同步：仅内存，保留向后兼容）
 */
export function getReqIdForChat(chatId, accountId = "default") {
    return getOrCreateReqIdStore(accountId).getSync(chatId);
}
/**
 * 删除 chatId 对应的 reqId
 */
export function deleteReqIdForChat(chatId, accountId = "default") {
    getOrCreateReqIdStore(accountId).delete(chatId);
}
/**
 * 启动时预热 reqId 缓存（从磁盘加载到内存）
 *
 * 注意：由于移除了磁盘存储，此函数现在只返回 0（无预热条目）
 */
export async function warmupReqIdStore(accountId = "default", log) {
    // 由于移除了磁盘存储，不再需要预热过程
    log?.("[WeCom] reqid-store warmup: no-op (disk storage removed)");
    return 0;
}
/**
 * 立即将 reqId 数据刷写到磁盘（用于优雅退出）
 *
 * 注意：由于移除了磁盘存储，此函数现在是无操作
 */
export async function flushReqIdStore(accountId = "default") {
    // 由于移除了磁盘存储，不再需要刷写操作
}
/** sessionKey → SessionChatInfo 映射 */
const sessionChatInfoMap = new Map();
/** 容量上限，超出按插入顺序淘汰最旧项，避免长时间运行内存增长 */
const SESSION_CHAT_INFO_MAX_SIZE = 5000;
/**
 * 记录 sessionKey 对应的原始会话信息（由 monitor.ts 在消息入站时调用）
 */
export function setSessionChatInfo(sessionKey, info) {
    if (!sessionKey)
        return;
    // 容量控制：超限时淘汰最早插入的条目（Map 保留插入顺序）
    if (sessionChatInfoMap.size >= SESSION_CHAT_INFO_MAX_SIZE && !sessionChatInfoMap.has(sessionKey)) {
        const oldestKey = sessionChatInfoMap.keys().next().value;
        if (oldestKey !== undefined) {
            sessionChatInfoMap.delete(oldestKey);
        }
    }
    sessionChatInfoMap.set(sessionKey, info);
}
/**
 * 获取 sessionKey 对应的原始会话信息（由 registerTool 闭包调用）
 */
export function getSessionChatInfo(sessionKey) {
    if (!sessionKey)
        return undefined;
    return sessionChatInfoMap.get(sessionKey);
}
/**
 * 删除 sessionKey 对应的会话信息（会话结束时可选调用）
 */
export function deleteSessionChatInfo(sessionKey) {
    sessionChatInfoMap.delete(sessionKey);
}
// ============================================================================
// 全局 cleanup 原始位置
// ============================================================================
/**
 * 清理指定账户的所有资源
 */
export async function cleanupAccount(accountId) {
    // 1. 断开 WSClient
    const wsClient = shared.wsClientInstances.get(accountId);
    if (wsClient) {
        try {
            wsClient.disconnect();
        }
        catch {
            // 忽略断开连接时的错误
        }
        shared.wsClientInstances.delete(accountId);
    }
    // 2. 由于移除了磁盘存储，不再需要 flush reqId 存储
    // 注意：不删除 store，因为重连后可能还需要
}
/**
 * 清理所有资源（用于进程退出）
 */
export async function cleanupAll() {
    // 停止定期清理
    stopMessageStateCleanup();
    // 清理所有 WSClient
    for (const [accountId, wsClient] of shared.wsClientInstances) {
        try {
            wsClient.disconnect();
        }
        catch {
            // 忽略
        }
    }
    shared.wsClientInstances.clear();
    // 由于移除了磁盘存储，不再需要 flush 所有 reqId 存储
    // 清空消息状态
    clearAllMessageStates();
}
