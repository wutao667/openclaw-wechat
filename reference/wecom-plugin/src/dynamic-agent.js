/**
 * **动态 Agent 路由模块**
 *
 * 为每个用户/群组自动生成独立的 Agent ID，实现会话隔离。
 * 参考: openclaw-plugin-wecom/dynamic-agent.js
 */
/**
 * **getDynamicAgentConfig (读取动态 Agent 配置)**
 *
 * 从全局配置中读取动态 Agent 配置，提供默认值。
 */
export function getDynamicAgentConfig(config) {
    const dynamicAgents = config?.channels?.wecom?.dynamicAgents;
    return {
        enabled: dynamicAgents?.enabled ?? false,
        dmCreateAgent: dynamicAgents?.dmCreateAgent ?? true,
        groupEnabled: dynamicAgents?.groupEnabled ?? true,
        adminUsers: dynamicAgents?.adminUsers ?? [],
    };
}
function sanitizeDynamicIdPart(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");
}
/**
 * **generateAgentId (生成动态 Agent ID)**
 *
 * 根据账号 + 聊天类型 + 对端 ID 生成确定性的 Agent ID，避免多账号串会话。
 * 格式: wecom-{accountId}-{type}-{sanitizedPeerId}
 */
export function generateAgentId(chatType, peerId, accountId) {
    const sanitizedPeer = sanitizeDynamicIdPart(peerId) || "unknown";
    const sanitizedAccountId = sanitizeDynamicIdPart(accountId ?? "default") || "default";
    return `wecom-${sanitizedAccountId}-${chatType}-${sanitizedPeer}`;
}
/**
 * **shouldUseDynamicAgent (检查是否使用动态 Agent)**
 *
 * 根据配置和发送者信息判断是否应使用动态 Agent。
 * 管理员（adminUsers）始终绕过动态路由，使用主 Agent。
 */
export function shouldUseDynamicAgent(params) {
    const { chatType, senderId, config } = params;
    const dynamicConfig = getDynamicAgentConfig(config);
    if (!dynamicConfig.enabled) {
        return false;
    }
    // 管理员绕过动态路由
    const sender = String(senderId).trim().toLowerCase();
    const isAdmin = dynamicConfig.adminUsers.some((admin) => admin.trim().toLowerCase() === sender);
    if (isAdmin) {
        return false;
    }
    if (chatType === "group") {
        return dynamicConfig.groupEnabled;
    }
    return dynamicConfig.dmCreateAgent;
}
