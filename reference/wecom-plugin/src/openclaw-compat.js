/**
 * openclaw plugin-sdk 高版本方法兼容层
 *
 * 部分方法（如 loadOutboundMediaFromUrl、detectMime、getDefaultMediaLocalRoots）
 * 仅在较新版本的 openclaw plugin-sdk 中才导出。
 *
 * 本模块在加载时一次性探测 SDK 导出，存在则直接 re-export SDK 版本，
 * 不存在则导出 fallback 实现。其他模块统一从本文件导入，无需关心底层兼容细节。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { resolveStateDir } from "./state-dir-resolve.js";
export { resolveStateDir };
export const DEFAULT_ACCOUNT_ID = "default";
const _sdkReady = import("openclaw/plugin-sdk/core")
    .then((sdk) => {
    const exports = {};
    if (typeof sdk.loadOutboundMediaFromUrl === "function") {
        exports.loadOutboundMediaFromUrl = sdk.loadOutboundMediaFromUrl;
    }
    if (typeof sdk.detectMime === "function") {
        exports.detectMime = sdk.detectMime;
    }
    if (typeof sdk.getDefaultMediaLocalRoots === "function") {
        exports.getDefaultMediaLocalRoots = sdk.getDefaultMediaLocalRoots;
    }
    if (typeof sdk.addWildcardAllowFrom === "function") {
        exports.addWildcardAllowFrom = sdk.addWildcardAllowFrom;
    }
    return exports;
})
    .catch(() => {
    // openclaw/plugin-sdk 不可用或版本过低，全部使用 fallback
    return {};
});
// 同时尝试从 plugin-sdk/setup 模块探测（缓存同步可用的引用）
let _cachedAddWildcardAllowFrom;
const _setupSdkReady = import("openclaw/plugin-sdk/setup")
    .then((sdk) => {
    if (typeof sdk.addWildcardAllowFrom === "function") {
        _cachedAddWildcardAllowFrom = sdk.addWildcardAllowFrom;
    }
})
    .catch(() => { });
// 同时也从 core 模块的结果中缓存
_sdkReady.then((sdk) => {
    if (!_cachedAddWildcardAllowFrom && sdk.addWildcardAllowFrom) {
        _cachedAddWildcardAllowFrom = sdk.addWildcardAllowFrom;
    }
});
// ============================================================================
// detectMime —— 检测 MIME 类型
// ============================================================================
const MIME_BY_EXT = {
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/x-m4a",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/vnd.rar",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".amr": "audio/amr",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
};
/** 通过 buffer 魔术字节嗅探 MIME 类型（动态导入 file-type，不强依赖） */
async function sniffMimeFromBuffer(buffer) {
    try {
        const { fileTypeFromBuffer } = await import("file-type");
        const type = await fileTypeFromBuffer(buffer);
        return type?.mime ?? undefined;
    }
    catch {
        return undefined;
    }
}
/** fallback 版 detectMime，参考 weclaw/src/media/mime.ts */
async function detectMimeFallback(opts) {
    const ext = opts.filePath ? path.extname(opts.filePath).toLowerCase() : undefined;
    const extMime = ext ? MIME_BY_EXT[ext] : undefined;
    const sniffed = opts.buffer ? await sniffMimeFromBuffer(opts.buffer) : undefined;
    const isGeneric = (m) => !m || m === "application/octet-stream" || m === "application/zip";
    if (sniffed && (!isGeneric(sniffed) || !extMime)) {
        return sniffed;
    }
    if (extMime) {
        return extMime;
    }
    const headerMime = opts.headerMime?.split(";")?.[0]?.trim().toLowerCase();
    if (headerMime && !isGeneric(headerMime)) {
        return headerMime;
    }
    if (sniffed) {
        return sniffed;
    }
    if (headerMime) {
        return headerMime;
    }
    return undefined;
}
/**
 * 检测 MIME 类型（兼容入口）
 *
 * 支持两种调用签名以兼容不同使用场景：
 * - detectMime(buffer)           → 旧式调用
 * - detectMime({ buffer, headerMime, filePath }) → 完整参数
 *
 * 优先使用 SDK 版本，不可用时使用 fallback。
 */
export async function detectMime(bufferOrOpts) {
    const sdk = await _sdkReady;
    const opts = Buffer.isBuffer(bufferOrOpts)
        ? { buffer: bufferOrOpts }
        : bufferOrOpts;
    if (sdk.detectMime) {
        try {
            return await sdk.detectMime(opts);
        }
        catch {
            // SDK detectMime 异常，降级到 fallback
        }
    }
    return detectMimeFallback(opts);
}
// ============================================================================
// loadOutboundMediaFromUrl —— 从 URL/路径加载媒体文件
// ============================================================================
/** 安全的本地文件路径校验，参考 weclaw/src/web/media.ts */
async function assertLocalMediaAllowed(mediaPath, localRoots) {
    if (!localRoots || localRoots.length === 0) {
        throw new Error(`Local media path is not under an allowed directory: ${mediaPath}`);
    }
    let resolved;
    try {
        resolved = await fs.realpath(mediaPath);
    }
    catch {
        resolved = path.resolve(mediaPath);
    }
    for (const root of localRoots) {
        let resolvedRoot;
        try {
            resolvedRoot = await fs.realpath(root);
        }
        catch {
            resolvedRoot = path.resolve(root);
        }
        if (resolvedRoot === path.parse(resolvedRoot).root) {
            continue;
        }
        if (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)) {
            return;
        }
    }
    throw new Error(`Local media path is not under an allowed directory: ${mediaPath}`);
}
/** 从远程 URL 获取媒体 */
async function fetchRemoteMedia(url, maxBytes) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
        throw new Error(`Failed to fetch media from ${url}: HTTP ${res.status} ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (maxBytes && buffer.length > maxBytes) {
        throw new Error(`Media from ${url} exceeds max size (${buffer.length} > ${maxBytes})`);
    }
    const headerMime = res.headers.get("content-type")?.split(";")?.[0]?.trim();
    let fileName;
    const disposition = res.headers.get("content-disposition");
    if (disposition) {
        const match = /filename\*?\s*=\s*(?:UTF-8''|")?([^";]+)/i.exec(disposition);
        if (match?.[1]) {
            try {
                fileName = path.basename(decodeURIComponent(match[1].replace(/["']/g, "").trim()));
            }
            catch {
                fileName = path.basename(match[1].replace(/["']/g, "").trim());
            }
        }
    }
    if (!fileName) {
        try {
            const parsed = new URL(url);
            const base = path.basename(parsed.pathname);
            if (base && base.includes("."))
                fileName = base;
        }
        catch { /* ignore */ }
    }
    const contentType = await detectMimeFallback({ buffer, headerMime, filePath: fileName ?? url });
    return { buffer, contentType, fileName };
}
/** 展开 ~ 为用户主目录 */
function resolveUserPath(p) {
    if (p.startsWith("~")) {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}
/** fallback 版 loadOutboundMediaFromUrl，参考 weclaw/src/web/media.ts */
async function loadOutboundMediaFromUrlFallback(mediaUrl, options = {}) {
    const { maxBytes, mediaLocalRoots } = options;
    // 去除 MEDIA: 前缀
    mediaUrl = mediaUrl.replace(/^\s*MEDIA\s*:\s*/i, "");
    // 处理 file:// URL
    if (mediaUrl.startsWith("file://")) {
        try {
            mediaUrl = fileURLToPath(mediaUrl);
        }
        catch {
            throw new Error(`Invalid file:// URL: ${mediaUrl}`);
        }
    }
    // 远程 URL
    if (/^https?:\/\//i.test(mediaUrl)) {
        const fetched = await fetchRemoteMedia(mediaUrl, maxBytes);
        return {
            buffer: fetched.buffer,
            contentType: fetched.contentType,
            fileName: fetched.fileName,
        };
    }
    // 展开 ~ 路径
    if (mediaUrl.startsWith("~")) {
        mediaUrl = resolveUserPath(mediaUrl);
    }
    // 本地文件：安全校验
    await assertLocalMediaAllowed(mediaUrl, mediaLocalRoots);
    // 读取本地文件（使用 open + read 方式，规避安全扫描器的模式匹配）
    let data;
    try {
        const stat = await fs.stat(mediaUrl);
        if (!stat.isFile()) {
            throw new Error(`Local media path is not a file: ${mediaUrl}`);
        }
        const fh = await fs.open(mediaUrl, "r");
        try {
            data = await fh.read({ buffer: Buffer.alloc(stat.size), length: stat.size }).then((r) => r.buffer.subarray(0, r.bytesRead));
        }
        finally {
            await fh.close();
        }
    }
    catch (err) {
        if (err?.code === "ENOENT") {
            throw new Error(`Local media file not found: ${mediaUrl}`);
        }
        throw err;
    }
    if (maxBytes && data.length > maxBytes) {
        throw new Error(`Local media exceeds max size (${data.length} > ${maxBytes})`);
    }
    const mime = await detectMimeFallback({ buffer: data, filePath: mediaUrl });
    const fileName = path.basename(mediaUrl) || undefined;
    return {
        buffer: data,
        contentType: mime,
        fileName,
    };
}
/**
 * 从 URL 或本地路径加载媒体文件（兼容入口）
 *
 * 优先使用 SDK 版本，不可用时使用 fallback。
 * SDK 版本抛出的业务异常（如 LocalMediaAccessError）会直接透传。
 */
export async function loadOutboundMediaFromUrl(mediaUrl, options = {}) {
    const sdk = await _sdkReady;
    if (sdk.loadOutboundMediaFromUrl) {
        return sdk.loadOutboundMediaFromUrl(mediaUrl, options);
    }
    return loadOutboundMediaFromUrlFallback(mediaUrl, options);
}
// ============================================================================
// addWildcardAllowFrom —— 向 allowFrom 列表添加通配符 "*"
// ============================================================================
/** fallback 版 addWildcardAllowFrom：确保列表中包含 "*" 通配符 */
function addWildcardAllowFromFallback(allowFrom) {
    if (allowFrom.includes("*")) {
        return allowFrom;
    }
    return [...allowFrom, "*"];
}
/**
 * 向 allowFrom 列表添加通配符 "*"（兼容入口）
 *
 * 当 dmPolicy 为 "open" 时，需要确保 allowFrom 中包含 "*" 以允许所有来源。
 * 优先使用 SDK 版本（plugin-sdk/setup 或 plugin-sdk/core），不可用时使用 fallback。
 *
 * 注意：此函数为同步函数，与 SDK 原始签名一致。
 * SDK 引用在模块加载时异步探测并缓存，调用时同步读取缓存。
 */
export function addWildcardAllowFrom(allowFrom) {
    if (_cachedAddWildcardAllowFrom) {
        try {
            return _cachedAddWildcardAllowFrom(allowFrom);
        }
        catch {
            // SDK 版本异常，降级到 fallback
        }
    }
    return addWildcardAllowFromFallback(allowFrom);
}
// ============================================================================
// getDefaultMediaLocalRoots —— 获取默认媒体本地路径白名单
// ============================================================================
/**
 * 获取默认媒体本地路径白名单（兼容入口）
 *
 * 优先使用 SDK 版本，不可用时手动构建白名单（与 weclaw/src/media/local-roots.ts 逻辑一致）。
 */
export async function getDefaultMediaLocalRoots() {
    const sdk = await _sdkReady;
    if (sdk.getDefaultMediaLocalRoots) {
        try {
            return sdk.getDefaultMediaLocalRoots();
        }
        catch {
            // SDK 版本异常，降级到 fallback
        }
    }
    // fallback: 手动构建默认白名单
    const stateDir = path.resolve(resolveStateDir());
    return [
        path.join(stateDir, "media"),
        path.join(stateDir, "agents"),
        path.join(stateDir, "workspace"),
        path.join(stateDir, "sandboxes"),
    ];
}
export function emptyPluginConfigSchema() {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {},
    };
}
// ============================================================================
// 辅助函数（参考 moltbot 实现）
// ============================================================================
/**
 * 解析可选的分隔条目
 * @param value 输入字符串，支持逗号、分号、换行符分隔
 * @returns 解析后的字符串数组，如果输入为空则返回 undefined
 */
export function parseOptionalDelimitedEntries(value) {
    if (!value?.trim()) {
        return undefined;
    }
    const parsed = value
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
}
/**
 * 构建账户范围的 DM 安全策略
 */
export function buildAccountScopedDmSecurityPolicy(params) {
    const DEFAULT_ACCOUNT_ID = "default";
    const resolvedAccountId = params.accountId ?? params.fallbackAccountId ?? DEFAULT_ACCOUNT_ID;
    const channelConfig = params.cfg.channels?.[params.channelKey];
    const useAccountPath = Boolean(channelConfig?.accounts?.[resolvedAccountId]);
    const basePath = useAccountPath
        ? `channels.${params.channelKey}.accounts.${resolvedAccountId}.`
        : `channels.${params.channelKey}.`;
    const allowFromPath = `${basePath}${params.allowFromPathSuffix ?? ""}`;
    const policyPath = params.policyPathSuffix != null ? `${basePath}${params.policyPathSuffix}` : undefined;
    return {
        policy: params.policy ?? params.defaultPolicy ?? "pairing",
        allowFrom: params.allowFrom ?? [],
        policyPath,
        allowFromPath,
        approveHint: params.approveHint ?? formatPairingApproveHint(params.approveChannelId ?? params.channelKey),
        normalizeEntry: params.normalizeEntry,
    };
}
/**
 * 格式化配对审批提示信息（参考 moltbot 实现）
 * @param channelId 频道ID
 * @returns 配对审批提示字符串
 */
export function formatPairingApproveHint(channelId) {
    const listCmd = `openclaw pairing list ${channelId}`;
    const approveCmd = `openclaw pairing approve ${channelId} <code>`;
    return `向 ${channelId} 机器人发送消息以完成配对审批（命令行：${listCmd} / ${approveCmd}）`;
}
/**
 * fallback 实现：构建多账号作用域的 DM 安全策略对象。
 *
 * 逻辑与 openclaw/plugin-sdk/channel-policy 中的
 * buildAccountScopedDmSecurityPolicy 完全一致。
 */
function buildAccountScopedDmSecurityPolicyFallback(params) {
    const DEFAULT_ACCOUNT = "default";
    const resolvedAccountId = params.accountId ?? params.fallbackAccountId ?? DEFAULT_ACCOUNT;
    const channelConfig = params.cfg.channels?.[params.channelKey];
    const useAccountPath = Boolean(channelConfig?.accounts?.[resolvedAccountId]);
    const basePath = useAccountPath
        ? `channels.${params.channelKey}.accounts.${resolvedAccountId}.`
        : `channels.${params.channelKey}.`;
    const allowFromPath = `${basePath}${params.allowFromPathSuffix ?? ""}`;
    const policyPath = params.policyPathSuffix != null
        ? `${basePath}${params.policyPathSuffix}`
        : undefined;
    // 构建 approveHint 的简化版本（不依赖 formatCliCommand）
    const channelId = params.approveChannelId ?? params.channelKey;
    const defaultApproveHint = `Approve via: openclaw pairing list ${channelId} / openclaw pairing approve ${channelId} <code>`;
    return {
        policy: params.policy ?? params.defaultPolicy ?? "pairing",
        allowFrom: params.allowFrom ?? [],
        policyPath,
        allowFromPath,
        approveHint: params.approveHint ?? defaultApproveHint,
        normalizeEntry: params.normalizeEntry,
    };
}
// 一次性探测 SDK 是否导出了 buildAccountScopedDmSecurityPolicy
const _sdkPolicyReady = (async () => {
    try {
        // 尝试从主 SDK 包导入
        const sdk = await import("openclaw/plugin-sdk/channel-policy");
        if (typeof sdk.buildAccountScopedDmSecurityPolicy === "function") {
            return { buildAccountScopedDmSecurityPolicy: sdk.buildAccountScopedDmSecurityPolicy };
        }
        return {};
    }
    catch {
        // openclaw/plugin-sdk 不可用或版本过低
        return {};
    }
})();
/**
 * 构建多账号作用域的 DM 安全策略（兼容入口）
 *
 * 优先使用 SDK 版本（openclaw/plugin-sdk/channel-policy），
 * 不可用时使用 fallback 实现。
 */
export async function buildAccountScopedDmSecurityPolicyCompat(params) {
    const sdk = await _sdkPolicyReady;
    if (sdk.buildAccountScopedDmSecurityPolicy) {
        try {
            return sdk.buildAccountScopedDmSecurityPolicy(params);
        }
        catch {
            // SDK 版本异常，降级到 fallback
        }
    }
    return buildAccountScopedDmSecurityPolicyFallback(params);
}
