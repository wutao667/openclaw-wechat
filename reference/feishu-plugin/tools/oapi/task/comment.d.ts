/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_comment tool -- Manage Feishu task comments.
 *
 * P1 Actions: create, list, get 支持通过 auth_type 参数切换用户(user)或应用(tenant)身份。
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasks/:task_guid/comments
 *   - list:   GET  /open-apis/task/v2/tasks/:task_guid/comments
 *   - get:    GET  /open-apis/task/v2/comments/:comment_id
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskCommentTool(api: OpenClawPluginApi): void;
