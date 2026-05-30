/**
 * 企业微信媒体（图片）下载和保存模块
 *
 * 负责下载、检测格式、保存图片到本地，包含超时保护
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { WSClient } from "@wecom/aibot-node-sdk";
import type { ResolvedWeComAccount } from "./utils.js";
/**
 * 附件超过 OpenClaw 配置的 `agents.defaults.mediaMaxMb` 上限时抛出。
 *
 * 本错误由插件层主动判定并抛出，不依赖 OpenClaw 核心层错误消息的字符串匹配，
 * 上层（monitor）可通过 `instanceof MediaOversizeError` 精确识别并向用户提示。
 */
export declare class MediaOversizeError extends Error {
    readonly kind: "image" | "file";
    readonly filename?: string;
    readonly sizeBytes: number;
    readonly maxBytes: number;
    constructor(params: {
        kind: "image" | "file";
        filename?: string;
        sizeBytes: number;
        maxBytes: number;
    });
}
/**
 * 下载并保存所有图片到本地，每张图片的下载带超时保护
 */
export declare function downloadAndSaveImages(params: {
    imageUrls: string[];
    imageAesKeys?: Map<string, string>;
    account: ResolvedWeComAccount;
    config: OpenClawConfig;
    runtime: RuntimeEnv;
    wsClient: WSClient;
}): Promise<Array<{
    path: string;
    contentType?: string;
}>>;
/**
 * 下载并保存所有文件到本地，每个文件的下载带超时保护
 */
export declare function downloadAndSaveFiles(params: {
    fileUrls: string[];
    fileAesKeys?: Map<string, string>;
    account: ResolvedWeComAccount;
    config: OpenClawConfig;
    runtime: RuntimeEnv;
    wsClient: WSClient;
}): Promise<Array<{
    path: string;
    contentType?: string;
}>>;
