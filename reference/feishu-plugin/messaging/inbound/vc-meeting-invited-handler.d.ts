/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * VC meeting invited event handler for the Lark/Feishu channel plugin.
 *
 * Handles `vc.bot.meeting_invited_v1` by converting the event into a
 * synthetic natural-language inbound and dispatching it through the
 * standard OpenClaw agent pipeline.
 */
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import type { FeishuVcMeetingInvitedEvent } from '../types';
export declare function handleFeishuVcMeetingInvited(params: {
    cfg: ClawdbotConfig;
    event: FeishuVcMeetingInvitedEvent;
    runtime?: RuntimeEnv;
    chatHistories?: Map<string, HistoryEntry[]>;
    accountId?: string;
}): Promise<void>;
