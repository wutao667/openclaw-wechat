/**
 * 企业微信 setupWizard — 声明式 CLI setup wizard 配置。
 *
 * 框架通过 plugin.setupWizard 字段识别并驱动 channel 的引导配置流程。
 */
import type { ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/setup";
export declare const wecomSetupAdapter: ChannelSetupAdapter;
export declare const wecomSetupWizard: ChannelSetupWizard;
