/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_agent tool -- Manage Feishu Task Agent registration.
 *
 * Actions:
 * - register:        Register task agent (tenant identity)
 * - update_profile:  Update task agent profile (tenant identity)
 *

 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskAgentTool(api: OpenClawPluginApi): void;
