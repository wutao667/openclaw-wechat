import fs from "fs";
import path from "path";
import os from "os";
import { WebSocket } from "ws";
import { CHANNEL_ID } from "./const.js";

let state = {
  ws: null,
  runtime: null,
  account: null,
  reconnectTimer: null,
  heartbeatTimer: null,
  reconnectAttempts: 0,
  intentionalClose: false,
  fullCfg: {},
};

function loadGatewayConfig() {
  try {
    const configPath = path.resolve(os.homedir(), ".openclaw/openclaw.json");
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.warn("[webchat] could not load gateway config:", err.message);
    return {};
  }
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function clearHeartbeatTimer() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

function startHeartbeat() {
  clearHeartbeatTimer();
  state.heartbeatTimer = setInterval(() => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "ping", pluginId: state.account?.pluginId }));
    }
  }, 30_000);
}

function scheduleReconnect() {
  if (state.intentionalClose || state.reconnectTimer) return;

  state.reconnectAttempts += 1;
  const delay = Math.min(30_000, Math.max(2_000, 2 ** state.reconnectAttempts * 1_000));

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

function connectWebSocket() {
  const account = state.account;
  if (!account?.serverUrl) return;

  clearReconnectTimer();
  clearHeartbeatTimer();

  const ws = new WebSocket(account.serverUrl);
  state.ws = ws;

  ws.on("open", () => {
    state.reconnectAttempts = 0;
    ws.send(
      JSON.stringify({
        type: "register",
        pluginId: account.pluginId,
        agents: account.agents,
      }),
    );
    startHeartbeat();
  });

  ws.on("message", async (data) => {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch (err) {
      console.error("[webchat] failed to parse websocket message", err);
      return;
    }

    if (message.type === "incoming") {
      try {
        await dispatchIncoming(message);
      } catch (err) {
        console.error("[webchat] failed to dispatch incoming message", err);
      }
      return;
    }

    if (message.type === "registered") {
      console.log("[webchat] registered with chat server");
      return;
    }

    if (message.type === "agent_list") {
      console.log("[webchat] agent list received", message.agents || []);
    }
  });

  ws.on("close", () => {
    if (state.ws === ws) {
      state.ws = null;
    }
    clearHeartbeatTimer();
    if (!state.intentionalClose) {
      scheduleReconnect();
    }
  });

  ws.on("error", (err) => {
    console.error("[webchat] websocket error", err);
    ws.close();
  });
}

export function startWebChatWsClient(runtime, account) {
  state.runtime = runtime;
  state.account = account;
  state.fullCfg = loadGatewayConfig();
  state.intentionalClose = false;
  connectWebSocket();
}

export function stopWebChatWsClient() {
  state.intentionalClose = true;
  clearReconnectTimer();
  clearHeartbeatTimer();

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

export function sendOutgoingMessage({ to, text, accountId, cfg }) {
  const acc = state.account;
  const rawTo = String(to || "");
  let userId = rawTo.replace(/^webchat:/, "");
  if (!userId) {
    userId = rawTo.match(/webchat:([^:\s/]+)/)?.[1] || rawTo.match(/([^:\s/]+)$/)?.[1] || "";
  }

  const agentId = acc?.agents?.[0]?.agentId || "default";
  const messageId = `webchat_out_${Date.now()}`;

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebChat websocket is not connected");
  }

  state.ws.send(
    JSON.stringify({
      type: "outgoing",
      pluginId: acc?.pluginId,
      agentId,
      userId,
      content: text,
      messageId,
    }),
  );

  return { channel: CHANNEL_ID, messageId, chatId: userId };
}

async function dispatchIncoming(message) {
  const core = state.runtime;
  if (!core) return;

  const content = String(message.content || message.Body || "");
  const userId = String(message.userId || "");
  const userName = String(message.userName || userId);
  const agentId = String(message.agentId || "");
  const conversationId = String(message.conversationId || userId);
  const acc = state.account;
  const cfg = state.fullCfg || {};

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId: acc.accountId,
    peer: { kind: "direct", id: conversationId },
    agentId: agentId || acc.agents?.[0]?.agentId || "default",
  });

  route.sessionKey = `${CHANNEL_ID}:${userId}:${agentId}`;

  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: content,
    RawBody: content,
    CommandBody: content,
    MessageSid: message.messageId || `webchat_${Date.now()}`,
    From: `${CHANNEL_ID}:${userId}`,
    To: `${CHANNEL_ID}:${conversationId}`,
    SenderId: userId,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: `user:${userName}`,
    Timestamp: Date.now(),
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `${CHANNEL_ID}:${conversationId}`,
    CommandAuthorized: true,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey || route.sessionKey,
    ctx: ctxPayload,
    updateLastRoute: {
      sessionKey: route.mainSessionKey || route.sessionKey,
      channel: CHANNEL_ID,
      to: `${CHANNEL_ID}:${conversationId}`,
      accountId: route.accountId,
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      deliver: async (payload) => {
        if (!payload.text) return;
        if (state.ws?.readyState === WebSocket.OPEN) {
          state.ws.send(
            JSON.stringify({
              type: "outgoing",
              pluginId: acc.pluginId,
              agentId: message.agentId,
              userId,
              content: payload.text,
              messageId: `webchat_reply_${Date.now()}`,
            }),
          );
        }
      },
    },
  });
}
