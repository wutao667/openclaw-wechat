import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { WecomAgentConfig, WecomBotConfig } from "../types/index.js";
type WecomCommandAuthAccountConfig = Pick<WecomBotConfig, "dmPolicy" | "allowFrom"> | Pick<WecomAgentConfig, "dmPolicy" | "allowFrom">;
export declare function resolveWecomCommandAuthorization(params: {
    core: PluginRuntime;
    cfg: OpenClawConfig;
    accountConfig: WecomCommandAuthAccountConfig;
    rawBody: string;
    senderUserId: string;
}): Promise<{
    shouldComputeAuth: boolean;
    dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
    senderAllowed: boolean;
    authorizerConfigured: boolean;
    commandAuthorized: boolean | undefined;
    effectiveAllowFrom: string[];
}>;
export declare function buildWecomUnauthorizedCommandPrompt(params: {
    senderUserId: string;
    dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
    scope: "bot" | "agent";
}): string;
export {};
