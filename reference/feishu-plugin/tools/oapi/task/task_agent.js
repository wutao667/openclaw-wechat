"use strict";
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
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskAgentTool = registerFeishuTaskAgentTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
const raw_request_1 = require("../../../core/raw-request.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskAgentSchema = typebox_1.Type.Union([
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('register'),
    }),
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('update_profile'),
        profile_content: typebox_1.Type.String(),
    }),
]);
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function resolvePathForAction(action) {
    if (action === 'register') {
        return { path: '/open-apis/task/v2/agent/register_agent', env: [] };
    }
    return { path: '/open-apis/task/v2/agent/update_agent_profile', env: [] };
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskAgentTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient } = (0, helpers_1.createToolContext)(api, 'feishu_task_agent');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_agent',
        label: 'Feishu Task Agent Registration',
        description: '飞书任务 Agent 注册管理工具。用于注册/取消注册 Task Agent，以及查询已注册列表。',
        parameters: FeishuTaskAgentSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const normalizedAction = p.action;
                const resolved = resolvePathForAction(p.action);
                const client = toolClient();
                const tatRes = await (0, raw_request_1.rawLarkRequest)({
                    brand: client.account.brand,
                    path: '/open-apis/auth/v3/tenant_access_token/internal/',
                    method: 'POST',
                    body: {
                        app_id: client.sdk.appId,
                        app_secret: client.sdk.appSecret,
                    },
                });
                const token = tatRes?.tenant_access_token ?? "";
                // Match openclaw-lark-task semantics:
                // - register/update_profile use tenant identity (TAT)
                const as = normalizedAction === 'register' || normalizedAction === 'update_profile'
                    ? 'tenant'
                    : 'user';
                if (normalizedAction === 'update_profile') {
                    const res = await client.invokeByPath('feishu_task_agent.update_profile', resolved.path, {
                        method: 'POST',
                        as,
                        body: {
                            profile_content: p.profile_content,
                        },
                        headers: {
                            'authorization': `Bearer ${token}`,
                        },
                    });
                    return (0, helpers_1.json)(res);
                }
                // register
                if (normalizedAction === 'register') {
                    const res = await client.invokeByPath('feishu_task_agent.register', resolved.path, {
                        method: 'POST',
                        as,
                        headers: {
                            'authorization': `Bearer ${token}`,
                        },
                    });
                    return (0, helpers_1.json)(res);
                }
                return (0, helpers_1.json)({
                    error: `p.action is invalid ${normalizedAction}`,
                });
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_agent' });
}
