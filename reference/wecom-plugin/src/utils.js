/**
 * 企业微信公共工具函数
 */
import { DEFAULT_ACCOUNT_ID } from "./openclaw-compat.js";
import { CHANNEL_ID } from "./const.js";
export const DefaultWsUrl = "wss://openws.work.weixin.qq.com";
/**
 * 解析企业微信账户配置
 */
export function resolveWeComAccount(cfg) {
    const wecomConfig = (cfg.channels?.[CHANNEL_ID] ?? {});
    return {
        accountId: DEFAULT_ACCOUNT_ID,
        name: wecomConfig.name ?? "企业微信",
        enabled: wecomConfig.enabled !== false,
        websocketUrl: wecomConfig.websocketUrl || DefaultWsUrl,
        botId: wecomConfig.botId ?? "",
        secret: wecomConfig.secret ?? "",
        sendThinkingMessage: wecomConfig.sendThinkingMessage ?? true,
        config: wecomConfig,
    };
}
/**
 * 设置企业微信账户配置
 */
export function setWeComAccount(cfg, account) {
    const existing = (cfg.channels?.[CHANNEL_ID] ?? {});
    const merged = {
        enabled: account.enabled ?? existing?.enabled ?? true,
        botId: account.botId ?? existing?.botId ?? "",
        secret: account.secret ?? existing?.secret ?? "",
        allowFrom: account.allowFrom ?? existing?.allowFrom,
        dmPolicy: account.dmPolicy ?? existing?.dmPolicy,
        // 以下字段仅在已有配置值或显式传入时才写入，onboarding 时不主动生成
        ...(account.websocketUrl || existing?.websocketUrl
            ? { websocketUrl: account.websocketUrl ?? existing?.websocketUrl }
            : {}),
        ...(account.name || existing?.name
            ? { name: account.name ?? existing?.name }
            : {}),
        ...(account.sendThinkingMessage !== undefined || existing?.sendThinkingMessage !== undefined
            ? { sendThinkingMessage: account.sendThinkingMessage ?? existing?.sendThinkingMessage }
            : {}),
    };
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            [CHANNEL_ID]: merged,
        },
    };
}
/**
 * 解析出口代理 URL（对齐原版 resolveWecomEgressProxyUrl）
 *
 * 优先级：
 * 1. config.channels.wecom.network.egressProxyUrl
 * 2. 环境变量：OPENCLAW_WECOM_EGRESS_PROXY_URL → WECOM_EGRESS_PROXY_URL → HTTPS_PROXY → ALL_PROXY → HTTP_PROXY
 */
export function resolveWecomEgressProxyUrl(cfg) {
    const wecom = (cfg.channels?.[CHANNEL_ID] ?? {});
    const proxyUrl = wecom.network?.egressProxyUrl ??
        process.env.OPENCLAW_WECOM_EGRESS_PROXY_URL ??
        process.env.WECOM_EGRESS_PROXY_URL ??
        process.env.HTTPS_PROXY ??
        process.env.ALL_PROXY ??
        process.env.HTTP_PROXY ??
        "";
    return proxyUrl.trim() || undefined;
}
