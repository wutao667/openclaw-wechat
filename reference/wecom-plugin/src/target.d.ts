/**
 * WeCom Target Resolver (企业微信目标解析器)
 *
 * 解析 OpenClaw 的 `to` 字段（原始目标字符串），将其转换为企业微信支持的具体接收对象。
 * 支持显式前缀 (party:, tag: 等) 和基于规则的启发式推断。
 *
 * **关于“目标发送”与“消息记录”的对应关系 (Target vs Inbound):**
 * - **发送 (Outbound)**: 支持一对多广播 (Party/Tag)。
 *   例如发送给 `party:1`，消息会触达该部门下所有成员。
 * - **接收 (Inbound)**: 总是来自具体的 **用户 (User)** 或 **群聊 (Chat)**。
 *   当成员回复部门广播消息时，可以视为一个新的单聊会话或在该成员的现有单聊中回复。
 *   因此，Outbound Target (如 Party) 与 Inbound Source (User) 不需要也不可能 1:1 强匹配。
 *   广播是“发后即忘” (Fire-and-Forget) 的通知模式，而回复是具体的会话模式。
 */
export interface WecomTarget {
    touser?: string;
    toparty?: string;
    totag?: string;
    chatid?: string;
}
/**
 * Parses a raw target string into a WeComTarget object.
 * 解析原始目标字符串为 WeComTarget 对象。
 *
 * 逻辑:
 * 1. 移除标准命名空间前缀 (wecom:, qywx: 等)。
 * 2. 检查显式类型前缀 (party:, tag:, group:, user:)。
 * 3. 启发式回退 (无前缀时):
 *    - 以 "wr" 或 "wc" 开头 -> Chat ID (群聊)
 *    - 纯数字 -> Party ID (部门)
 *    - 其他 -> User ID (用户)
 *
 * @param raw - The raw target string (e.g. "party:1", "zhangsan", "wecom:wr123")
 */
export declare function resolveWecomTarget(raw: string | undefined): WecomTarget | undefined;
