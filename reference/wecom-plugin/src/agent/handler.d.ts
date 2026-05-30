/**
 * WeCom Agent Webhook 处理器
 * 处理 XML 格式回调
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/core";
import type { ResolvedAgentAccount } from "../types/index.js";
import type { WecomAgentInboundMessage } from "../types/index.js";
/**
 * **AgentWebhookParams (Webhook 处理器参数)**
 *
 * 传递给 Agent Webhook 处理函数的上下文参数集合。
 * @property req Node.js 原始请求对象
 * @property res Node.js 原始响应对象
 * @property agent 解析后的 Agent 账号信息
 * @property config 全局插件配置
 * @property core OpenClaw 插件运行时
 * @property log 可选日志输出函数
 * @property error 可选错误输出函数
 */
export type AgentWebhookParams = {
    req: IncomingMessage;
    res: ServerResponse;
    /**
     * 上游已完成验签/解密时传入，避免重复协议处理。
     * 仅用于 POST 消息回调流程。
     */
    verifiedPost?: {
        timestamp: string;
        nonce: string;
        signature: string;
        encrypted: string;
        decrypted: string;
        parsed: WecomAgentInboundMessage;
    };
    agent: ResolvedAgentAccount;
    config: OpenClawConfig;
    core: PluginRuntime;
    log?: (msg: string) => void;
    error?: (msg: string) => void;
};
export type AgentInboundProcessDecision = {
    shouldProcess: boolean;
    reason: string;
};
/**
 * 仅允许“用户意图消息”进入 AI 会话。
 * - event 回调（如 enter_agent/subscribe）不应触发会话与自动回复
 * - 系统发送者（sys）不应触发会话与自动回复
 * - 缺失发送者时默认丢弃，避免写入异常会话
 */
export declare function shouldProcessAgentInboundMessage(params: {
    msgType: string;
    fromUser: string;
    eventType?: string;
}): AgentInboundProcessDecision;
/**
 * **handleAgentWebhook (Agent Webhook 入口)**
 *
 * 统一处理 Agent 模式的 POST 消息回调请求。
 * URL 验证与验签/解密由 monitor 层统一处理后再调用本函数。
 */
export declare function handleAgentWebhook(params: AgentWebhookParams): Promise<boolean>;
