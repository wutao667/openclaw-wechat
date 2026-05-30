import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { WeComConfig, WeComAccountConfig, ResolvedWeComAccount } from "./utils.js";
/**
 * 企业微信多账号配置结构（扩展 WeComConfig）
 */
export interface WeComMultiAccountConfig extends WeComConfig {
    /** 默认账号 ID */
    defaultAccount?: string;
    /** 多账号配置 */
    accounts?: Record<string, WeComAccountConfig>;
}
/**
 * 判断是否为多账号模式（即配置中存在 accounts 字段）。
 * 用于区分单账号/多账号模式的分支判断，替代 `accountId === DEFAULT_ACCOUNT_ID` 的不可靠判断。
 */
export declare function hasMultiAccounts(cfg: OpenClawConfig): boolean;
/**
 * 列出所有企业微信账号 ID。
 * 如果没有 accounts 字段，返回 [DEFAULT_ACCOUNT_ID] 以向后兼容。
 */
export declare function listWeComAccountIds(cfg: OpenClawConfig): string[];
/**
 * 解析默认账号 ID。
 *
 * 优先级：
 * 1. 显式设置的 defaultAccount
 * 2. 包含 DEFAULT_ACCOUNT_ID 的账号列表
 * 3. 字母序第一个账号
 */
export declare function resolveDefaultWeComAccountId(cfg: OpenClawConfig): string;
/**
 * 解析单个企业微信账号的完整配置。
 *
 * 支持：
 * - 显式指定 accountId → 使用该 accountId
 * - 未指定 → 使用默认账号
 * - 单账号模式（无 accounts 字段） → 直接读取顶层配置
 */
export declare function resolveWeComAccountMulti(params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
}): ResolvedWeComAccount;
/**
 * 列出所有已启用且已配置凭据的账号。
 */
export declare function listEnabledWeComAccounts(cfg: OpenClawConfig): ResolvedWeComAccount[];
/**
 * 写入企业微信账户配置（自动区分单账号/多账号模式）。
 *
 * - 单账号模式（无 accounts 字段）：写入顶层 channels.wecom
 * - 多账号模式：写入 channels.wecom.accounts[accountId]
 *
 * @param cfg  当前全局配置
 * @param updates  要写入的部分配置字段
 * @param accountId  目标账号 ID（默认写入默认账号）
 */
export declare function setWeComAccountMulti(cfg: OpenClawConfig, updates: Partial<WeComConfig>, accountId?: string): OpenClawConfig;
