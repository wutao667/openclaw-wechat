/**
 * 文档授权错误拦截器
 *
 * 当 category=doc 的 MCP 调用返回 errcode=851013/851014/851008（文档授权错误）时：
 * 1. 通过 aibot_send_biz_msg 命令向用户发送授权引导卡片
 * 2. 拦截 help_message 内容，不将其传递给 LLM
 * 3. 返回简化响应，告知 LLM 授权卡片已发送、无需再做处理
 */
import { generateReqId } from "@wecom/aibot-node-sdk";
import { getWeComWebSocket } from "../../state-manager.js";
import { resolveCurrentAccountId } from "../transport.js";
import { withTimeout } from "../../timeout.js";
import { AIBOT_SEND_BIZ_MSG_CMD, BIZ_MSG_SEND_TIMEOUT_MS } from "../../const.js";
// ============================================================================
// 常量
// ============================================================================
/** 需要拦截的文档授权错误码集合 */
/* https://doc.weixin.qq.com/sheet/e3_AFcARgbdAFwCNU0pwubawRtGzcd6z?scode=AJEAIQdfAAoEpqtRfRAMEA4QYkACk&tab=BB08J2 */
const DOC_AUTH_ERROR_CODES = new Set([851013, 851014, 851008]);
/**
 * 业务消息类型枚举（对应 AiBotBizMsgType）
 * - 1: 文档权限
 */
const AIBOT_BIZ_MSG_TYPE_DOC_READ_AUTH = 1;
/**
 * 聊天类型枚举（对应 AiBotBizMsgChatType）
 * - 1: 单聊
 * - 2: 群聊
 */
const AIBOT_BIZ_MSG_CHAT_TYPE_SINGLE = 1;
const AIBOT_BIZ_MSG_CHAT_TYPE_GROUP = 2;
// ============================================================================
// 拦截器实现
// ============================================================================
export const docAuthErrorInterceptor = {
    name: "doc-auth-error",
    /** 仅对 doc 品类生效 */
    match: (ctx) => ctx.category === "doc",
    /** 检测文档授权错误，发送授权引导卡片并拦截原始响应 */
    async afterCall(ctx, result) {
        return interceptDocAuthError(ctx, result);
    },
};
// ============================================================================
// 内部实现
// ============================================================================
/**
 * 从 MCP 返回结果中解析业务 JSON
 */
function parseBizData(result) {
    if (!result || typeof result !== "object")
        return null;
    const { content } = result;
    if (!Array.isArray(content))
        return null;
    const textItem = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (!textItem)
        return null;
    try {
        return JSON.parse(textItem.text);
    }
    catch {
        return null;
    }
}
/**
 * 通过 WSClient 发送 aibot_send_biz_msg 命令
 *
 * 按照 WwOpenWsSendAiBotBizMsgReq proto 定义构造请求体：
 *   - chat_id:   会话标识
 *   - userid:    发送者 userid
 *   - biz_type:  业务消息类型（AiBotBizMsgType）
 *   - chat_type: 聊天类型（AiBotBizMsgChatType，1=单聊，2=群聊）
 */
async function sendBizMsg(params) {
    const accountId = params.accountId || resolveCurrentAccountId();
    const wsClient = getWeComWebSocket(accountId);
    if (!wsClient) {
        console.warn(`[mcp] doc-auth-error: WSClient 未连接 (accountId="${accountId}")，无法发送授权卡片`);
        return;
    }
    const reqId = generateReqId("biz_msg");
    // 构造 WwOpenWsSendAiBotBizMsgReqBody
    const body = {
        biz_type: AIBOT_BIZ_MSG_TYPE_DOC_READ_AUTH,
    };
    if (params.chatId) {
        body.chat_id = params.chatId;
    }
    if (params.userid) {
        body.userid = params.userid;
    }
    if (params.chatType) {
        body.chat_type = params.chatType === "group"
            ? AIBOT_BIZ_MSG_CHAT_TYPE_GROUP
            : AIBOT_BIZ_MSG_CHAT_TYPE_SINGLE;
    }
    console.log(`[mcp] doc-auth-error: 发送 aibot_send_biz_msg, body=${JSON.stringify(body)}`);
    try {
        await withTimeout(wsClient.reply({ headers: { req_id: reqId } }, body, AIBOT_SEND_BIZ_MSG_CMD), BIZ_MSG_SEND_TIMEOUT_MS, `aibot_send_biz_msg timed out after ${BIZ_MSG_SEND_TIMEOUT_MS}ms`);
        console.log(`[mcp] doc-auth-error: 授权卡片发送成功 (chatId="${params.chatId}", userid="${params.userid}", chatType="${params.chatType}")`);
    }
    catch (err) {
        console.error(`[mcp] doc-auth-error: 授权卡片发送失败: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }
}
/**
 * 拦截文档授权错误
 *
 * 检测 errcode=851013/851014/851008 时：
 * 1. 通过 aibot_send_biz_msg 发送授权引导卡片（携带 chat_id、userid、chat_type）
 * 2. 返回简化响应，告知 LLM 授权卡片已直接发送给用户
 *
 * 数据来源链路（chatId 全程保留原始大小写，单一事实来源）：
 *
 *   aibot_msg_callback.body.chatid  (原始大小写)
 *     ↓
 *   monitor.ts:processWeComMessageNow
 *     → setSessionChatInfo(route.sessionKey, { chatId, chatType })  ← 以 sessionKey 为键
 *     ↓
 *   OpenClaw core 调用工具工厂，传入 ctx.sessionKey
 *     ↓
 *   index.ts:registerTool
 *     → getSessionChatInfo(ctx.sessionKey) 精确取回 { chatId, chatType }
 *     → createWeComMcpTool({ chatId, chatType })
 *     ↓
 *   tool.ts:handleCall 将其注入 CallContext
 *     ↓
 *   本拦截器直接使用 ctx.chatId / ctx.chatType （无需反解 sessionKey、无需兜底）
 *
 * ⚠️ 切勿使用 parseSessionKeyChat(ctx.sessionKey) 反向解析 chatId：
 *    OpenClaw core 构建 sessionKey 时会将 peer.id 强制小写化，
 *    企业微信 aibot_send_biz_msg 的 chat_id 是大小写敏感的，
 *    小写后会收到 errcode=93006 (invalid chatid)。
 */
async function interceptDocAuthError(ctx, result) {
    const bizData = parseBizData(result);
    if (!bizData)
        return result;
    const errcode = bizData.errcode;
    if (typeof errcode !== "number" || !DOC_AUTH_ERROR_CODES.has(errcode)) {
        return result;
    }
    console.log(`[mcp] doc-auth-error: 检测到文档授权错误 errcode=${errcode}, ` +
        `method=${ctx.method}, category=${ctx.category}`);
    // chatId / chatType 已由 monitor.ts → state-manager → index.ts 透传到 ctx，
    // 这里直接使用即可，原始大小写保留不变。
    const { requesterUserId: userid, chatId, chatType, accountId } = ctx;
    if (!chatId || !chatType) {
        console.warn(`[mcp] doc-auth-error: ctx 缺少 chatId/chatType（可能会话信息未记录），` +
            `userid="${userid}", chatId="${chatId}", chatType="${chatType}"，跳过发送授权卡片`);
    }
    else {
        console.log(`[mcp] doc-auth-error: 发送授权卡片参数: userid="${userid}", chatId="${chatId}", chatType="${chatType}"`);
        await sendBizMsg({ chatId, userid, chatType, accountId });
    }
    // 构造简化响应：不将 help_message 传递给 LLM，
    // 告知 LLM 授权提示已直接发送给用户，无需再做任何操作
    const simplifiedResult = {
        errcode,
        errmsg: bizData.errmsg ?? "authorization error",
        _biz_msg_sent: true,
        _user_hint: "文档授权提示卡片已直接发送给用户，无需再向用户转述任何授权相关的信息。请告知用户：已发送授权引导，请按照提示完成授权后重试。",
    };
    return {
        content: [{
                type: "text",
                text: JSON.stringify(simplifiedResult),
            }],
    };
}
