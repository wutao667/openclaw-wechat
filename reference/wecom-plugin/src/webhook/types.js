/**
 * Webhook 模式专用类型定义
 *
 * 从 @mocrane/wecom monitor/types.ts 完整迁移，适配目标项目类型体系。
 */
// ============================================================================
// 常量
// ============================================================================
/** StreamState 过期时间 (10 分钟) */
export const STREAM_TTL_MS = 10 * 60 * 1000;
/** ActiveReply 过期时间 (1 小时) */
export const ACTIVE_REPLY_TTL_MS = 60 * 60 * 1000;
/** 消息防抖间隔 (500ms) */
export const DEFAULT_DEBOUNCE_MS = 500;
/** stream 回复最大字节数 (20KB) */
export const STREAM_MAX_BYTES = 20_480;
/** 企微 Bot 回复窗口 (6 分钟) */
export const BOT_WINDOW_MS = 6 * 60 * 1000;
/** 超时安全边际 (30 秒) */
export const BOT_SWITCH_MARGIN_MS = 30_000;
/** HTTP 请求超时 (15 秒) */
export const REQUEST_TIMEOUT_MS = 15_000;
/** 自动清理间隔 (60 秒) */
export const PRUNE_INTERVAL_MS = 60_000;
/** 固定 Webhook 路径 */
export const WEBHOOK_PATHS = {
    /** Bot 模式历史兼容路径 */
    BOT: "/wecom",
    /** Bot 模式历史备用兼容路径 */
    BOT_ALT: "/wecom/bot",
    /** Bot 模式推荐路径前缀 */
    BOT_PLUGIN: "/plugins/wecom/bot",
};
