"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "video_chat" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertVideoChat = void 0;
const utils_1 = require("./utils.js");
const convertVideoChat = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const topic = parsed?.topic ?? '';
    const meetingNo = parsed?.meet_number?.trim() ?? '';
    const parts = [];
    if (topic) {
        parts.push(`Topic: ${topic}`);
    }
    if (parsed?.start_time) {
        parts.push(`Start time: ${(0, utils_1.millisToDatetime)(parsed.start_time)}`);
    }
    if (meetingNo) {
        parts.push(`Meeting number: ${meetingNo}`);
    }
    const inner = parts.join('\n') || '[video chat]';
    return {
        content: `<meeting>${inner}</meeting>`,
        resources: [],
    };
};
exports.convertVideoChat = convertVideoChat;
