/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Structured tool-use display for Lark/Feishu cards.
 */
import type { ToolUseTraceStep } from './tool-use-trace-store';
export type ToolUseStepStatus = ToolUseTraceStep['status'];
export interface ToolUseDisplayBlock {
    language: 'json' | 'text';
    content: string;
}
export interface ToolUseDisplayStep {
    title: string;
    detail?: string;
    iconToken: string;
    status: ToolUseStepStatus;
    resultBlock?: ToolUseDisplayBlock;
    errorBlock?: ToolUseDisplayBlock;
}
export interface ToolUseDisplayResult {
    content: string;
    stepCount: number;
    steps: ToolUseDisplayStep[];
}
export declare const EMPTY_TOOL_USE_PLACEHOLDER = "No tool steps available";
export declare function normalizeToolUseDisplay(params: {
    traceSteps?: ToolUseTraceStep[];
    showFullPaths?: boolean;
    showResultDetails?: boolean;
}): ToolUseDisplayResult;
export declare function buildToolUseTitleSuffix(params: {
    stepCount: number;
}): {
    zh: string;
    en: string;
};
