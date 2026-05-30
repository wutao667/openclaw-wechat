/**
 * Webhook Gateway 生命周期管理
 *
 * 从 @mocrane/wecom gateway-monitor.ts 部分迁移（仅 Webhook 部分）。
 * 负责：初始化状态、注册 Target、启停管理。
 *
 * 关键设计：
 * - MonitorState 是全局单例（monitorState），所有账号共享同一个 StreamStore 和 ActiveReplyStore
 * - Target 注册/注销不影响 monitorState 生命周期，只控制 pruneTimer 的启停
 * - 每个账号注册多条路径（兼容历史路径 + 推荐路径 + 多账号路径）
 * - 按 accountId 管理各自的 unregister，stop 时只注销该账号的 Target
 */
import type { WebhookGatewayContext } from "./types.js";
import { WebhookMonitorState } from "./state.js";
/**
 * 获取当前的 MonitorState 实例（全局单例）
 *
 * 供 monitor.ts 等内部模块调用以访问 StreamStore 和 ActiveReplyStore。
 */
export declare function getMonitorState(): WebhookMonitorState;
/**
 * 启动 Webhook Gateway
 *
 * 1. 验证 Webhook 配置
 * 2. 确保 pruneTimer 启动
 * 3. 设置 FlushHandler（仅首次）
 * 4. 解析并注册多条 Webhook 路径
 */
export declare function startWebhookGateway(ctx: WebhookGatewayContext): void;
/**
 * 停止 Webhook Gateway
 *
 * 1. 注销该账号的 Target（不影响其他账号）
 * 2. 如果没有任何活跃 Target，停止清理定时器
 */
export declare function stopWebhookGateway(ctx: WebhookGatewayContext): void;
