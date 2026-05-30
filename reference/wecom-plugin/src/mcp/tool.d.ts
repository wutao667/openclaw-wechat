/**
 * wecom_mcp — 模拟 MCP 调用的 Agent Tool
 *
 * 通过 MCP Streamable HTTP 传输协议调用企业微信 MCP Server，
 * 提供 list（列出所有工具）和 call（调用工具）两个操作。
 *
 * 在 skills 中的使用方式：
 *   wecom_mcp list <category>
 *   wecom_mcp call <category> <method> '<jsonArgs>'
 *
 * 示例：
 *   wecom_mcp list contact
 *   wecom_mcp call contact getContact '{}'
 */
interface CreateWeComMcpToolOptions {
    /** 当前会话可信的企业微信 userid */
    requesterUserId?: string;
    /** 当前会话对应的账户 ID（来自 ctx.agentAccountId） */
    accountId?: string;
    /** 当前会话的 chatId（群组 ID 或用户 ID），用于 aibot_send_biz_msg 等命令 */
    chatId?: string;
    /** 当前会话的聊天类型：single（单聊）或 group（群聊） */
    chatType?: "single" | "group";
}
/**
 * 创建 wecom_mcp Agent Tool 定义
 */
export declare function createWeComMcpTool(options?: CreateWeComMcpToolOptions): {
    name: string;
    label: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            action: {
                type: string;
                enum: string[];
                description: string;
            };
            category: {
                type: string;
                description: string;
            };
            method: {
                type: string;
                description: string;
            };
            args: {
                type: string[];
                description: string;
            };
        };
        required: string[];
    };
    execute(_toolCallId: string, params: unknown): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: unknown;
    }>;
};
export {};
