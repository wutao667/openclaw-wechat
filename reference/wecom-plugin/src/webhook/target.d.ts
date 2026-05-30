/**
 * Webhook Target 管理
 *
 * 从 @mocrane/wecom monitor.ts 部分迁移（仅 Webhook Target 相关）。
 * 维护全局已注册 Target 列表，提供注册/注销/查询功能。
 *
 * Target 按路径索引：Map<path, WecomWebhookTarget[]>
 * 同一路径可能注册多个账号（老路径兼容模式），通过签名验证匹配到正确账号。
 */
import type { WecomWebhookTarget } from "./types.js";
/**
 * 注册 Webhook Target（多条路径）
 *
 * 为每条路径分别注册 Target，返回一个注销函数（一次性注销所有路径）。
 */
export declare function registerWecomWebhookTarget(target: WecomWebhookTarget, paths: string[]): () => void;
/**
 * 获取全局 Target 注册表
 *
 * 返回完整的 Map<path, Target[]>，供 handler.ts 路由匹配使用。
 */
export declare function getWebhookTargetsMap(): ReadonlyMap<string, WecomWebhookTarget[]>;
/**
 * 获取所有已注册的 Webhook Target（扁平列表）
 *
 * 用于无法精确匹配路径时的逐一签名验证场景。
 */
export declare function getRegisteredTargets(): WecomWebhookTarget[];
/**
 * 判断是否有活跃 Target
 */
export declare function hasActiveTargets(): boolean;
/**
 * 从 URL 中解析 accountId（多账号路径）
 *
 * 支持路径格式：
 * - /plugins/wecom/bot/{accountId}
 * - /wecom/bot/{accountId}
 * - /wecom/{accountId}
 */
export declare function parseWebhookPath(url: string): string | undefined;
