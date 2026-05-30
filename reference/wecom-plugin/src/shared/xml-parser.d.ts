/**
 * WeCom XML 解析器
 * 用于 Agent 模式解析 XML 格式消息
 */
import type { WecomAgentInboundMessage } from "../types/index.js";
/**
 * 解析 XML 字符串为消息对象
 */
export declare function parseXml(xml: string): WecomAgentInboundMessage;
/**
 * 从 XML 中提取消息类型
 */
export declare function extractMsgType(msg: WecomAgentInboundMessage): string;
/**
 * 从 XML 中提取发送者 ID
 */
export declare function extractFromUser(msg: WecomAgentInboundMessage): string;
/**
 * 从 XML 中提取文件名（主要用于 file 消息）
 */
export declare function extractFileName(msg: WecomAgentInboundMessage): string | undefined;
/**
 * 从 XML 中提取接收者 ID (CorpID)
 */
export declare function extractToUser(msg: WecomAgentInboundMessage): string;
/**
 * 从 XML 中提取群聊 ID
 */
export declare function extractChatId(msg: WecomAgentInboundMessage): string | undefined;
/**
 * 从 XML 中提取 AgentID（兼容 AgentID/agentid 等大小写）
 */
export declare function extractAgentId(msg: WecomAgentInboundMessage): string | number | undefined;
/**
 * 从 XML 中提取消息内容
 */
export declare function extractContent(msg: WecomAgentInboundMessage): string;
/**
 * 从 XML 中提取媒体 ID (Image, Voice, Video)
 * 根据官方文档，MediaId 在 Agent 回调中直接位于根节点
 */
export declare function extractMediaId(msg: WecomAgentInboundMessage): string | undefined;
/**
 * 从 XML 中提取 MsgId（用于去重）
 */
export declare function extractMsgId(msg: WecomAgentInboundMessage): string | undefined;
