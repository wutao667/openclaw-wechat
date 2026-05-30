/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_task tool -- Manage Feishu tasks.
 *
 * P0 Actions: create, get, list, patch
 * P1 Actions: add_members, append_steps
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasks
 *   - get:    GET  /open-apis/task/v2/tasks/:task_guid
 *   - list:   GET  /open-apis/task/v2/tasks
 *   - patch:  PATCH /open-apis/task/v2/tasks/:task_guid
 *   - add_members: POST /open-apis/task/v2/tasks/:task_guid/add_members
 *   - append_steps: POST /open-apis/task/v2/agent_task_step_info/append_task_steps
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskTaskTool(api: OpenClawPluginApi): void;
