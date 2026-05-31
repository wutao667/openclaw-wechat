import { DEFAULT_ACCOUNT_ID, DEFAULT_PLUGIN_ID, DEFAULT_SERVER_URL } from "./const.js";

export function resolveWebChatConfig(cfg) {
  return cfg.channels?.webchat || {};
}

export function listWebChatAccountIds(_cfg) {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultWebChatAccountId(_cfg) {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveWebChatAccount(cfg, accountId = DEFAULT_ACCOUNT_ID) {
  const section = resolveWebChatConfig(cfg);
  return {
    accountId,
    enabled: section.enabled !== false,
    serverUrl: section.serverUrl || DEFAULT_SERVER_URL,
    pluginId: section.pluginId || DEFAULT_PLUGIN_ID,
    agents: section.agents || [{ agentId: "nezha", name: "哪吒" }],
    allowFrom: section.allowFrom || ["*"],
    dmPolicy: section.dmPolicy || "open",
  };
}
