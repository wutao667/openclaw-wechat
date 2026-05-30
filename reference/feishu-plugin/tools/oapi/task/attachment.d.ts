/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_attachment tool -- Manage task attachments.
 *
 * Actions:
 * - upload: Upload task attachment (tenant identity)
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export interface FeishuTaskAttachmentParams {
    action: 'upload';
    resource_type?: 'task' | 'task_delivery';
    resource_id: string;
    file: string;
    name?: string;
}
export declare function registerFeishuTaskAttachmentTool(api: OpenClawPluginApi): void;
