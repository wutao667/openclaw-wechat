"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Card callback operator identity extraction.
 *
 * Feishu Schema 2 card callbacks may carry the operator identity under
 * either `operator.open_id` (Schema 1 / default) or `operator.user_id`
 * (Schema 2 when the user has no open_id in the app's tenant).
 *
 * This helper provides a single, consistent extraction point so that
 * every card callback handler resolves the operator identity the same
 * way.  See openclaw/openclaw#71670 for the upstream Schema 2 change.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCardCallbackOperatorId = resolveCardCallbackOperatorId;
/**
 * Extract the operator's identity from a Feishu card callback event.
 *
 * Prefers `open_id` (the stable per-app user identifier) and falls back
 * to `user_id` when `open_id` is absent or empty — this is the Schema 2 path.
 *
 * @param operator - The `operator` field from the card callback payload.
 * @returns The resolved operator identifier, or `undefined` when neither
 *   field is present.
 */
function resolveCardCallbackOperatorId(operator) {
    return operator?.open_id || operator?.user_id;
}
