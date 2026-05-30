"use strict";
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
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskTaskTool = registerFeishuTaskTaskTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
const raw_request_1 = require("../../../core/raw-request.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskTaskSchema = typebox_1.Type.Union([
    // CREATE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        summary: typebox_1.Type.String({
            description: '任务标题',
        }),
        current_user_id: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '当前用户的 open_id（强烈建议，从消息上下文的 SenderId 获取）。如果 members 中不包含此用户，工具会自动添加为 follower，确保创建者可以编辑任务。',
        })),
        description: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '任务描述',
        })),
        due: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天任务',
            })),
        })),
        start: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天',
            })),
        })),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({
                description: '成员 ID（通常为 open_id）',
            }),
            type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['user', 'app'])),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), {
            description: '任务成员列表（assignee=负责人，follower=关注人）。成员类型（type）支持 user 和 app，默认为 user。机器人和应用应该使用app',
        })),
        repeat_rule: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '重复规则（RRULE 格式）',
        })),
        tasklists: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            tasklist_guid: typebox_1.Type.String({
                description: '清单 GUID',
            }),
            section_guid: typebox_1.Type.Optional(typebox_1.Type.String({
                description: '分组 GUID',
            })),
        }), {
            description: '任务所属清单列表',
        })),
        auth_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['tenant', 'user'], {
            description: '授权类型，默认 user。使用 user 时为用户身份（只能查看/操作自己有权限的任务），使用 tenant 时为应用身份。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // GET
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        task_guid: typebox_1.Type.String({
            description: 'Task GUID',
        }),
        auth_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['tenant', 'user'], {
            description: '授权类型，默认 user。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // LIST
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: '每页数量（默认 50，最大 100）。',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记',
        })),
        completed: typebox_1.Type.Optional(typebox_1.Type.Boolean({
            description: '是否筛选已完成任务',
        })),
        agent_task_status: typebox_1.Type.Optional(typebox_1.Type.Integer({
            description: 'Agent 任务状态',
        })),
        auth_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['tenant', 'user'], {
            description: '授权类型，默认 user。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // PATCH
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        task_guid: typebox_1.Type.String({
            description: 'Task GUID',
        }),
        summary: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的任务标题',
        })),
        description: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的任务描述',
        })),
        due: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "新的截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天任务',
            })),
        })),
        start: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "新的开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天',
            })),
        })),
        completed_at: typebox_1.Type.Optional(typebox_1.Type.String({
            description: "完成时间。支持三种格式：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'（设为已完成）；2) '0'（反完成，任务变为未完成）；3) 毫秒时间戳字符串。",
        })),
        agent_task_progress: typebox_1.Type.Optional(typebox_1.Type.String({
            description: 'Agent 任务进度',
        })),
        agent_task_status: typebox_1.Type.Optional(typebox_1.Type.Integer({
            description: 'Agent 任务状态',
        })),
        text_deliveries: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String(), {
            description: '文本交付列表',
        })),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({
                description: '成员 ID（通常为 open_id）',
            }),
            type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['user', 'app'])),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), {
            description: '新的任务成员列表。成员类型支持 user 和 app，默认为 user。',
        })),
        repeat_rule: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的重复规则（RRULE 格式）',
        })),
        auth_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['tenant', 'user'], {
            description: '授权类型，默认 user。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // ADD_MEMBERS
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('add_members'),
        task_guid: typebox_1.Type.String({
            description: 'Task GUID',
        }),
        members: typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({
                description: '成员 ID（通常为 open_id）',
            }),
            type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['user', 'app'])),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), {
            description: '要添加的成员列表（assignee=负责人，follower=关注人）。成员类型支持 user 和 app，默认为 user。',
        }),
        client_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '幂等token，如果提供则实现幂等行为',
        })),
        auth_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['tenant', 'user'], {
            description: '授权类型，默认 user。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // APPEND_STEPS
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('append_steps'),
        task_guid: typebox_1.Type.String({
            description: '任务 GUID',
        }),
        idempotent_key: typebox_1.Type.String({
            description: '幂等键',
        }),
        task_steps: typebox_1.Type.Array(typebox_1.Type.Object({
            quote: typebox_1.Type.String({
                description: '步骤引用信息',
            }),
            content: typebox_1.Type.String({
                description: '步骤内容',
            }),
            timestamp: typebox_1.Type.Integer({
                description: '步骤时间戳',
            }),
        }), {
            description: '要追加的任务步骤列表',
            minItems: 1,
        }),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskTaskTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_task_task');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_task',
        label: 'Feishu Task Management',
        description: "【以用户或应用身份】飞书任务管理工具。用于创建、查询、更新任务。Actions: create（创建任务）, get（获取任务详情）, list（查询任务列表，仅返回我负责的任务）, patch（更新任务）, add_members（添加任务成员）, append_steps（追加任务步骤记录）。时间参数使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。支持通过 auth_type 参数切换用户(user)或应用(tenant)身份；append_steps 固定使用应用身份。",
        parameters: FeishuTaskTaskSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE TASK
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: summary=${p.summary}`);
                        const taskData = {
                            summary: p.summary,
                        };
                        if (p.description)
                            taskData.description = p.description;
                        // Handle due time conversion
                        if (p.due?.timestamp) {
                            const dueTs = (0, helpers_1.parseTimeToTimestampMs)(p.due.timestamp);
                            if (!dueTs) {
                                return (0, helpers_1.json)({
                                    error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，例如 '2026-02-25 18:00'。",
                                    received: p.due.timestamp,
                                });
                            }
                            taskData.due = {
                                timestamp: dueTs,
                                is_all_day: p.due.is_all_day ?? false,
                            };
                            log.info(`create: due time converted: ${p.due.timestamp} -> ${dueTs}ms`);
                        }
                        // Handle start time conversion
                        if (p.start?.timestamp) {
                            const startTs = (0, helpers_1.parseTimeToTimestampMs)(p.start.timestamp);
                            if (!startTs) {
                                return (0, helpers_1.json)({
                                    error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.start.timestamp,
                                });
                            }
                            taskData.start = {
                                timestamp: startTs,
                                is_all_day: p.start.is_all_day ?? false,
                            };
                        }
                        if (p.members)
                            taskData.members = p.members;
                        if (p.repeat_rule)
                            taskData.repeat_rule = p.repeat_rule;
                        if (p.tasklists)
                            taskData.tasklists = p.tasklists;
                        const authType = p.auth_type || 'user';
                        const res = await client.invoke('feishu_task_task.create', (sdk, opts) => sdk.task.v2.task.create({
                            data: taskData,
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: authType });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`create: task created: task_guid=${data?.task?.guid}`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET TASK
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: task_guid=${p.task_guid}`);
                        const authType = p.auth_type || 'user';
                        const res = await client.invoke('feishu_task_task.get', (sdk, opts) => sdk.task.v2.task.get({
                            path: { task_guid: p.task_guid },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: authType });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: retrieved task ${p.task_guid}`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST TASKS
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: page_size=${p.page_size ?? 50}, completed=${p.completed ?? false}`);
                        const authType = p.auth_type || 'user';
                        const res = await client.invoke('feishu_task_task.list', (sdk, opts) => sdk.task.v2.task.list({
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                completed: p.completed,
                                agent_task_status: p.agent_task_status,
                                user_id_type: p.user_id_type || 'open_id',
                            },
                        }, opts), { as: authType });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} tasks`);
                        return (0, helpers_1.json)({
                            tasks: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH TASK
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: task_guid=${p.task_guid}`);
                        const updateData = {};
                        if (p.summary)
                            updateData.summary = p.summary;
                        if (p.description !== undefined)
                            updateData.description = p.description;
                        // Handle due time conversion
                        if (p.due?.timestamp) {
                            const dueTs = (0, helpers_1.parseTimeToTimestampMs)(p.due.timestamp);
                            if (!dueTs) {
                                return (0, helpers_1.json)({
                                    error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.due.timestamp,
                                });
                            }
                            updateData.due = {
                                timestamp: dueTs,
                                is_all_day: p.due.is_all_day ?? false,
                            };
                        }
                        // Handle start time conversion
                        if (p.start?.timestamp) {
                            const startTs = (0, helpers_1.parseTimeToTimestampMs)(p.start.timestamp);
                            if (!startTs) {
                                return (0, helpers_1.json)({
                                    error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.start.timestamp,
                                });
                            }
                            updateData.start = {
                                timestamp: startTs,
                                is_all_day: p.start.is_all_day ?? false,
                            };
                        }
                        // Handle completed_at conversion
                        if (p.completed_at !== undefined) {
                            // 特殊值：反完成（设为未完成）
                            if (p.completed_at === '0') {
                                updateData.completed_at = '0';
                            }
                            // 数字字符串时间戳（直通）
                            else if (/^\d+$/.test(p.completed_at)) {
                                updateData.completed_at = p.completed_at;
                            }
                            // 时间格式字符串（需要转换）
                            else {
                                const completedTs = (0, helpers_1.parseTimeToTimestampMs)(p.completed_at);
                                if (!completedTs) {
                                    return (0, helpers_1.json)({
                                        error: "completed_at 格式错误！支持：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'；2) '0'（反完成）；3) 毫秒时间戳字符串。",
                                        received: p.completed_at,
                                    });
                                }
                                updateData.completed_at = completedTs;
                            }
                        }
                        if (p.agent_task_progress !== undefined) {
                            updateData.agent_task_progress = p.agent_task_progress;
                        }
                        if (p.agent_task_status !== undefined) {
                            updateData.agent_task_status = p.agent_task_status;
                        }
                        if (p.text_deliveries !== undefined) {
                            updateData.text_deliveries = p.text_deliveries;
                        }
                        if (p.members)
                            updateData.members = p.members;
                        if (p.repeat_rule)
                            updateData.repeat_rule = p.repeat_rule;
                        // Build update_fields list (required by Task API)
                        const updateFields = Object.keys(updateData);
                        if (updateFields.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'patch 至少需要提供一个可更新字段：summary、description、due、start、completed_at、agent_task_progress、agent_task_status、text_deliveries、members、repeat_rule',
                            });
                        }
                        const authType = p.auth_type || 'user';
                        const res = await client.invoke('feishu_task_task.patch', (sdk, opts) => sdk.task.v2.task.patch({
                            path: { task_guid: p.task_guid },
                            data: {
                                task: updateData,
                                update_fields: updateFields,
                            },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: authType });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: task ${p.task_guid} updated`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // ADD_MEMBERS
                    // -----------------------------------------------------------------
                    case 'add_members': {
                        if (!p.members || p.members.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'members is required and cannot be empty',
                            });
                        }
                        log.info(`add_members: task_guid=${p.task_guid}, members_count=${p.members.length}`);
                        const memberData = p.members.map((m) => ({
                            id: m.id,
                            type: m.type || 'user',
                            role: m.role || 'follower',
                        }));
                        const requestData = { members: memberData };
                        if (p.client_token) {
                            requestData.client_token = p.client_token;
                        }
                        const authType = p.auth_type || 'user';
                        const res = await client.invoke('feishu_task_task.add_members', (sdk, opts) => sdk.task.v2.task.addMembers({
                            path: {
                                task_guid: p.task_guid,
                            },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                            data: requestData,
                        }, opts), { as: authType });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`add_members: added ${p.members.length} members to task ${p.task_guid}`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // APPEND TASK STEPS
                    // -----------------------------------------------------------------
                    case 'append_steps': {
                        if (!p.task_steps.length) {
                            return (0, helpers_1.json)({
                                error: 'task_steps is required and cannot be empty',
                            });
                        }
                        const tatRes = await (0, raw_request_1.rawLarkRequest)({
                            brand: client.account.brand,
                            path: '/open-apis/auth/v3/tenant_access_token/internal/',
                            method: 'POST',
                            body: {
                                app_id: client.sdk.appId,
                                app_secret: client.sdk.appSecret,
                            },
                        });
                        ;
                        const token = tatRes?.tenant_access_token ?? "";
                        const res = await client.invokeByPath('feishu_task_task.append_steps', '/open-apis/task/v2/agent_task_step_info/append_task_steps', {
                            method: 'POST',
                            as: 'tenant',
                            body: {
                                task_guid: p.task_guid,
                                idempotent_key: p.idempotent_key,
                                task_steps: p.task_steps,
                            },
                            headers: {
                                'authorization': `Bearer ${token}`,
                            },
                        });
                        return (0, helpers_1.json)(res);
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_task' });
}
