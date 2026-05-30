/**
 * Agent Webhook HTTP 入口
 *
 * 职责：
 * 1. 管理 AgentWebhookTarget 注册表（多账号共用同一 path 时按签名选中）
 * 2. GET  → echostr URL 验证
 * 3. POST → XML body 解密 → 调用 handleAgentWebhook
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { ResolvedAgentAccount } from "../types/index.js";
export type AgentWebhookTarget = {
    agent: ResolvedAgentAccount;
    config: OpenClawConfig;
    runtime: {
        log?: (msg: string) => void;
        error?: (msg: string) => void;
    };
    path: string;
};
export declare function registerAgentWebhookTarget(target: AgentWebhookTarget): void;
export declare function deregisterAgentWebhookTarget(accountId: string): void;
export declare function createWecomAgentWebhookHandler(runtime: PluginRuntime): (req: IncomingMessage, res: ServerResponse) => Promise<boolean | void>;
export declare function handleWecomAgentWebhookRequest(req: IncomingMessage, res: ServerResponse, runtime: PluginRuntime): Promise<boolean | void>;
