/**
 * openclaw plugin-sdk 高版本方法兼容层
 *
 * 部分方法（如 loadOutboundMediaFromUrl、detectMime、getDefaultMediaLocalRoots）
 * 仅在较新版本的 openclaw plugin-sdk 中才导出。
 *
 * 本模块在加载时一次性探测 SDK 导出，存在则直接 re-export SDK 版本，
 * 不存在则导出 fallback 实现。其他模块统一从本文件导入，无需关心底层兼容细节。
 */
import { resolveStateDir } from "./state-dir-resolve.js";
export { resolveStateDir };
export declare const DEFAULT_ACCOUNT_ID = "default";
/** 与 openclaw plugin-sdk 中 WebMediaResult 兼容的类型 */
export type WebMediaResult = {
    buffer: Buffer;
    contentType?: string;
    kind?: string;
    fileName?: string;
};
export type OutboundMediaLoadOptions = {
    maxBytes?: number;
    mediaLocalRoots?: readonly string[];
};
export type DetectMimeOptions = {
    buffer?: Buffer;
    headerMime?: string | null;
    filePath?: string;
};
/**
 * 检测 MIME 类型（兼容入口）
 *
 * 支持两种调用签名以兼容不同使用场景：
 * - detectMime(buffer)           → 旧式调用
 * - detectMime({ buffer, headerMime, filePath }) → 完整参数
 *
 * 优先使用 SDK 版本，不可用时使用 fallback。
 */
export declare function detectMime(bufferOrOpts: Buffer | DetectMimeOptions): Promise<string | undefined>;
/**
 * 从 URL 或本地路径加载媒体文件（兼容入口）
 *
 * 优先使用 SDK 版本，不可用时使用 fallback。
 * SDK 版本抛出的业务异常（如 LocalMediaAccessError）会直接透传。
 */
export declare function loadOutboundMediaFromUrl(mediaUrl: string, options?: OutboundMediaLoadOptions): Promise<WebMediaResult>;
/**
 * 向 allowFrom 列表添加通配符 "*"（兼容入口）
 *
 * 当 dmPolicy 为 "open" 时，需要确保 allowFrom 中包含 "*" 以允许所有来源。
 * 优先使用 SDK 版本（plugin-sdk/setup 或 plugin-sdk/core），不可用时使用 fallback。
 *
 * 注意：此函数为同步函数，与 SDK 原始签名一致。
 * SDK 引用在模块加载时异步探测并缓存，调用时同步读取缓存。
 */
export declare function addWildcardAllowFrom(allowFrom: string[]): string[];
/**
 * 获取默认媒体本地路径白名单（兼容入口）
 *
 * 优先使用 SDK 版本，不可用时手动构建白名单（与 weclaw/src/media/local-roots.ts 逻辑一致）。
 */
export declare function getDefaultMediaLocalRoots(): Promise<readonly string[]>;
export declare function emptyPluginConfigSchema(): Record<string, unknown>;
/**
 * 解析可选的分隔条目
 * @param value 输入字符串，支持逗号、分号、换行符分隔
 * @returns 解析后的字符串数组，如果输入为空则返回 undefined
 */
export declare function parseOptionalDelimitedEntries(value?: string): string[] | undefined;
/**
 * 构建账户范围的 DM 安全策略
 */
export declare function buildAccountScopedDmSecurityPolicy(params: {
    cfg: Record<string, unknown>;
    channelKey: string;
    accountId?: string | null;
    fallbackAccountId?: string | null;
    policy?: string | null;
    allowFrom?: Array<string | number> | null;
    defaultPolicy?: string;
    allowFromPathSuffix?: string;
    policyPathSuffix?: string;
    approveChannelId?: string;
    approveHint?: string;
    normalizeEntry?: (raw: string) => string;
}): {
    policy: string;
    allowFrom: Array<string | number>;
    policyPath?: string;
    allowFromPath: string;
    approveHint: string;
    normalizeEntry?: (raw: string) => string;
};
/**
 * 格式化配对审批提示信息（参考 moltbot 实现）
 * @param channelId 频道ID
 * @returns 配对审批提示字符串
 */
export declare function formatPairingApproveHint(channelId: string): string;
/**
 * 与 openclaw plugin-sdk/channel-policy 中 ChannelSecurityDmPolicy 兼容的类型。
 * 低版本 SDK 未导出该方法时，使用此 fallback。
 */
export type ChannelSecurityDmPolicyCompat = {
    policy: string;
    allowFrom?: Array<string | number> | null;
    policyPath?: string;
    allowFromPath: string;
    approveHint: string;
    normalizeEntry?: (raw: string) => string;
};
declare global {
    namespace openclaw.plugin.sdk {
        interface ChannelSecurityDmPolicy {
            policy: string;
            allowFrom?: Array<string | number> | null;
            policyPath?: string;
            allowFromPath: string;
            approveHint: string;
            normalizeEntry?: (raw: string) => string;
        }
    }
}
export type BuildAccountScopedDmSecurityPolicyParams = {
    cfg: {
        channels?: Record<string, unknown>;
    };
    channelKey: string;
    accountId?: string | null;
    fallbackAccountId?: string | null;
    policy?: string | null;
    allowFrom?: Array<string | number> | null;
    defaultPolicy?: string;
    allowFromPathSuffix?: string;
    policyPathSuffix?: string;
    approveChannelId?: string;
    approveHint?: string;
    normalizeEntry?: (raw: string) => string;
};
/**
 * 构建多账号作用域的 DM 安全策略（兼容入口）
 *
 * 优先使用 SDK 版本（openclaw/plugin-sdk/channel-policy），
 * 不可用时使用 fallback 实现。
 */
export declare function buildAccountScopedDmSecurityPolicyCompat(params: BuildAccountScopedDmSecurityPolicyParams): Promise<ChannelSecurityDmPolicyCompat>;
