/**
 * 命令授权（Command Authorization）
 *
 * 从 lh 版 shared/command-auth.ts 迁移。
 * 适配新版 WeComConfig（dmPolicy / allowFrom 扁平化在顶层）。
 */
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { WeComConfig } from "../utils.js";
/** 命令授权结果 */
export interface WecomCommandAuthResult {
    /** 当前消息是否是需要鉴权的命令 */
    shouldComputeAuth: boolean;
    /** 账号配置的私信策略 */
    dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
    /** 当前发送者是否在白名单中 */
    senderAllowed: boolean;
    /** 是否配置了授权器 */
    authorizerConfigured: boolean;
    /** 最终授权结果：true=放行，false=拒绝，undefined=不需要鉴权 */
    commandAuthorized: boolean | undefined;
    /** 生效的白名单列表 */
    effectiveAllowFrom: string[];
}
/**
 * 解析命令授权状态
 *
 * 适配新版 WeComConfig 的扁平化字段：
 * - dmPolicy → accountConfig.dmPolicy
 * - allowFrom → accountConfig.allowFrom
 */
export declare function resolveWecomCommandAuthorization(params: {
    core: PluginRuntime;
    cfg: OpenClawConfig;
    accountConfig: WeComConfig;
    rawBody: string;
    senderUserId: string;
}): Promise<WecomCommandAuthResult>;
/**
 * 构建未授权命令的中文提示文案
 *
 * @param scope - "bot"（智能机器人）或 "agent"（自建应用）
 */
export declare function buildWecomUnauthorizedCommandPrompt(params: {
    senderUserId: string;
    dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
    scope: "bot" | "agent";
}): string;
