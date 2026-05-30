"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_attachment tool -- Manage task attachments.
 *
 * Actions:
 * - upload: Upload task attachment (tenant identity)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskAttachmentTool = registerFeishuTaskAttachmentTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
const raw_request_1 = require("../../../core/raw-request.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskAttachmentSchema = typebox_1.Type.Union([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('upload'),
        resource_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['task', 'task_delivery'], {
            description: '资源类型，可选值：task、task_delivery。默认 task。',
            default: 'task',
        })),
        resource_id: typebox_1.Type.String({
            description: '资源 ID。',
        }),
        file: typebox_1.Type.String({
            description: '文件内容base64编码字符串',
        }),
        name: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '文件名。',
        })),
    }),
]);
;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function resolvePathForAction(action) {
    if (action === 'upload') {
        return { path: '/open-apis/task/v2/attachments/upload', env: [] };
    }
    return { path: '/open-apis/task/v2/attachments/upload', env: [] };
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskAttachmentTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient } = (0, helpers_1.createToolContext)(api, 'feishu_task_attachment');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_attachment',
        label: 'Feishu Task Attachment',
        description: '飞书任务附件工具。当前提供 upload action，用于上传任务附件。',
        parameters: FeishuTaskAttachmentSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const resolved = resolvePathForAction(p.action);
                const client = toolClient();
                const resourceType = p.resource_type ?? 'task';
                const formData = new FormData();
                formData.append('resource_type', resourceType);
                formData.append('resource_id', p.resource_id);
                // 将 base64 字符串解码为二进制文件
                const fileBuffer = Buffer.from(p.file, 'base64');
                // 创建 File 对象并添加到 FormData
                const file = new File([fileBuffer], p.name ?? 'attachment');
                formData.append('file', file);
                const as = 'tenant';
                const tatRes = await (0, raw_request_1.rawLarkRequest)({
                    brand: client.account.brand,
                    path: '/open-apis/auth/v3/tenant_access_token/internal/',
                    method: 'POST',
                    body: {
                        app_id: client.account.appId,
                        app_secret: client.account.appSecret,
                    },
                });
                const token = tatRes?.tenant_access_token;
                if (!token) {
                    return (0, helpers_1.json)({
                        error: 'Failed to get tenant_access_token.',
                        response: tatRes,
                    });
                }
                const res = await client.invokeByPath('feishu_task_attachment.upload', resolved.path, {
                    method: 'POST',
                    as,
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                return (0, helpers_1.json)(res);
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_attachment' });
}
