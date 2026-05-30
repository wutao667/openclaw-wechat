/**
 * 命令授权（Command Authorization）
 *
 * 从 lh 版 shared/command-auth.ts 迁移。
 * 适配新版 WeComConfig（dmPolicy / allowFrom 扁平化在顶层）。
 */
// ============================================================================
// 内部工具函数
// ============================================================================
/** 归一化白名单条目：去除空格、统一小写、去掉 wecom:/user:/userid: 前缀 */
function normalizeWecomAllowFromEntry(raw) {
    return raw
        .trim()
        .toLowerCase()
        .replace(/^wecom:/, "")
        .replace(/^user:/, "")
        .replace(/^userid:/, "");
}
/** 判断发送者是否在白名单中 */
function isWecomSenderAllowed(senderUserId, allowFrom) {
    const list = allowFrom.map((entry) => normalizeWecomAllowFromEntry(entry)).filter(Boolean);
    if (list.includes("*"))
        return true;
    const normalizedSender = normalizeWecomAllowFromEntry(senderUserId);
    if (!normalizedSender)
        return false;
    return list.includes(normalizedSender);
}
/**
 * 解析命令授权状态
 *
 * 适配新版 WeComConfig 的扁平化字段：
 * - dmPolicy → accountConfig.dmPolicy
 * - allowFrom → accountConfig.allowFrom
 */
export async function resolveWecomCommandAuthorization(params) {
    const { core, cfg, accountConfig, rawBody, senderUserId } = params;
    const dmPolicy = (accountConfig.dmPolicy ?? "pairing");
    const configAllowFrom = (accountConfig.allowFrom ?? []).map((v) => String(v));
    const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, cfg);
    // WeCom channel 不支持 pairing CLI（"Channel wecom does not support pairing"），
    // 因此 pairing 策略等同于 allowlist。
    // Policy 语义：
    // - open: 命令对所有人放行（除非更高层级的 access-groups 拒绝）
    // - allowlist: 命令需要 allowFrom 白名单
    // - pairing: 等同 allowlist（因 WeCom 不支持 pairing CLI）
    const effectiveAllowFrom = dmPolicy === "open" ? ["*"] : configAllowFrom;
    const senderAllowed = isWecomSenderAllowed(senderUserId, effectiveAllowFrom);
    const allowAllConfigured = effectiveAllowFrom.some((entry) => normalizeWecomAllowFromEntry(entry) === "*");
    const authorizerConfigured = allowAllConfigured || effectiveAllowFrom.length > 0;
    const useAccessGroups = cfg.commands?.useAccessGroups !== false;
    const commandAuthorized = shouldComputeAuth
        ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
            useAccessGroups,
            authorizers: [{ configured: authorizerConfigured, allowed: senderAllowed }],
        })
        : undefined;
    return {
        shouldComputeAuth,
        dmPolicy,
        senderAllowed,
        authorizerConfigured,
        commandAuthorized,
        effectiveAllowFrom,
    };
}
// ============================================================================
// 未授权提示文案构建
// ============================================================================
/**
 * 构建未授权命令的中文提示文案
 *
 * @param scope - "bot"（智能机器人）或 "agent"（自建应用）
 */
export function buildWecomUnauthorizedCommandPrompt(params) {
    const user = params.senderUserId || "unknown";
    const policy = params.dmPolicy;
    const scopeLabel = params.scope === "bot" ? "Bot（智能机器人）" : "Agent（自建应用）";
    const dmPrefix = params.scope === "bot" ? "channels.wecom.bot" : "channels.wecom.agent";
    const allowCmd = (value) => `openclaw config set ${dmPrefix}.allowFrom '${value}'`;
    const policyCmd = (value) => `openclaw config set ${dmPrefix}.dmPolicy "${value}"`;
    if (policy === "disabled") {
        return [
            `无权限执行命令（${scopeLabel} 已禁用：dmPolicy=disabled）`,
            `触发者：${user}`,
            `管理员：${policyCmd("open")}（全放开）或 ${policyCmd("allowlist")}（白名单）`,
        ].join("\n");
    }
    return [
        `无权限执行命令（入口：${scopeLabel}，userid：${user}）`,
        `管理员全放开：${policyCmd("open")}`,
        `管理员放行该用户：${policyCmd("allowlist")}`,
        `然后设置白名单：${allowCmd(JSON.stringify([user]))}`,
        `如果仍被拦截：检查 commands.useAccessGroups/访问组`,
    ].join("\n");
}
