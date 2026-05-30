# WebChat3.0 Implementation Guide

This guide describes how to implement WebChat3.0 as an OpenClaw Channel Plugin plus a standalone Chat Server.

The core architectural decision is that the plugin initiates the WebSocket connection to the Chat Server. This matches the WeCom and Feishu channel pattern: the OpenClaw instance can run inside a private network because it only needs outbound access to the public Chat Server.

## 1. Target Architecture

```
browser client
  |
  | WebSocket: /ws
  v
public Chat Server :3100
  |
  | WebSocket: /plugin
  | plugin connects outbound to server
  v
WebChat Channel Plugin
  |
  | api.registerChannel(...)
  | inbound dispatch + outbound.send
  v
OpenClaw Core / Agent
```

The Chat Server is a broker. It owns browser WebSocket connections, plugin WebSocket connections, HTTP static routes, and message routing. The plugin owns OpenClaw channel registration, inbound context creation, dispatch to core, and outbound delivery back to the Chat Server.

## 2. Project Structure

Use two deployable units: `server/` for the public broker and `plugin/` for the OpenClaw channel plugin.

```text
webchat3.0/
  server/
    package.json
    src/
      index.js
      protocol.js
      public/
        index.html
  plugin/
    package.json
    openclaw.plugin.json
    index.js
    src/
      channel.js
      ws-client.js
      runtime.js
      const.js
```

Recommended packages:

```json
{
  "type": "module",
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

Keep the Chat Server independent from OpenClaw. Keep OpenClaw SDK imports only in `plugin/`.

## 3. Message Protocol

All frames are JSON. Every receiver should ignore unknown message types and return explicit error frames for malformed messages.

### Browser to Chat Server

```json
{ "type": "register", "userId": "u_123", "userName": "Wu Tao" }
```

```json
{
  "type": "message",
  "pluginId": "webchat-channel",
  "agentId": "nezha",
  "content": "你好"
}
```

### Chat Server to Browser

```json
{ "type": "registered", "userId": "u_123" }
```

```json
{
  "type": "agent_list",
  "agents": [
    { "pluginId": "webchat-channel", "agentId": "nezha", "name": "哪吒" }
  ]
}
```

```json
{
  "type": "message",
  "from": "agent:nezha",
  "pluginId": "webchat-channel",
  "agentId": "nezha",
  "content": "我是哪吒"
}
```

### Plugin to Chat Server

```json
{
  "type": "register",
  "pluginId": "webchat-channel",
  "agents": [
    { "agentId": "nezha", "name": "哪吒" }
  ]
}
```

```json
{
  "type": "outgoing",
  "userId": "u_123",
  "pluginId": "webchat-channel",
  "agentId": "nezha",
  "content": "我是哪吒"
}
```

### Chat Server to Plugin

```json
{ "type": "registered", "ok": true }
```

```json
{
  "type": "incoming",
  "userId": "u_123",
  "userName": "Wu Tao",
  "pluginId": "webchat-channel",
  "agentId": "nezha",
  "content": "你好",
  "messageId": "msg_1710000000000_abcd"
}
```

```json
{
  "type": "agent_list_update",
  "agents": [
    { "pluginId": "webchat-channel", "agentId": "nezha", "name": "哪吒" }
  ]
}
```

## 4. Chat Server

The Chat Server listens on port `3100` and serves both HTTP and WebSocket traffic:

- `GET /` serves the browser app.
- `WS /ws` accepts browser clients.
- `WS /plugin` accepts channel plugin clients.

Connection state should use `Map` objects:

- `browserClients`: `userId -> { ws, userId, userName, lastSeenAt }`
- `pluginClients`: `pluginId -> { ws, pluginId, agents, lastSeenAt }`
- `socketMeta`: `ws -> { kind, id }`

### `server/src/protocol.js`

```js
export function parseJsonFrame(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

export function sendJson(ws, payload) {
  if (ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

export function createMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

### `server/src/index.js`

```js
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createMessageId, parseJsonFrame, sendJson } from "./protocol.js";

const PORT = Number(process.env.PORT || 3100);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browserClients = new Map();
const pluginClients = new Map();
const socketMeta = new Map();

function collectAgents() {
  return [...pluginClients.values()].flatMap((client) =>
    client.agents.map((agent) => ({
      pluginId: client.pluginId,
      agentId: agent.agentId,
      name: agent.name || agent.agentId,
    })),
  );
}

function broadcastAgentList() {
  const agents = collectAgents();
  for (const client of browserClients.values()) {
    sendJson(client.ws, { type: "agent_list", agents });
  }
}

function routeBrowserMessage(client, frame) {
  const pluginId = String(frame.pluginId || "").trim();
  const content = String(frame.content || "").trim();
  const agentId = String(frame.agentId || "").trim();

  if (!pluginId || !content) {
    sendJson(client.ws, { type: "error", error: "pluginId and content are required" });
    return;
  }

  const plugin = pluginClients.get(pluginId);
  if (!plugin) {
    sendJson(client.ws, { type: "error", error: `plugin not connected: ${pluginId}` });
    return;
  }

  sendJson(plugin.ws, {
    type: "incoming",
    userId: client.userId,
    userName: client.userName,
    pluginId,
    agentId,
    content,
    messageId: createMessageId(),
  });
}

function routePluginOutgoing(plugin, frame) {
  const userId = String(frame.userId || "").trim();
  const browser = browserClients.get(userId);
  if (!browser) {
    sendJson(plugin.ws, { type: "error", error: `browser not connected: ${userId}` });
    return;
  }

  sendJson(browser.ws, {
    type: "message",
    from: `agent:${frame.agentId || "default"}`,
    pluginId: plugin.pluginId,
    agentId: frame.agentId,
    content: String(frame.content || ""),
  });
}

function handleBrowserFrame(ws, frame) {
  if (frame.type === "register") {
    const userId = String(frame.userId || "").trim() || `web_${Date.now()}`;
    const userName = String(frame.userName || userId).trim();
    const client = { ws, userId, userName, lastSeenAt: Date.now() };

    browserClients.set(userId, client);
    socketMeta.set(ws, { kind: "browser", id: userId });

    sendJson(ws, { type: "registered", userId });
    sendJson(ws, { type: "agent_list", agents: collectAgents() });
    return;
  }

  const meta = socketMeta.get(ws);
  const client = meta ? browserClients.get(meta.id) : null;
  if (!client) {
    sendJson(ws, { type: "error", error: "browser must register first" });
    return;
  }

  if (frame.type === "message") {
    client.lastSeenAt = Date.now();
    routeBrowserMessage(client, frame);
  }
}

function handlePluginFrame(ws, frame) {
  if (frame.type === "register") {
    const pluginId = String(frame.pluginId || "").trim();
    if (!pluginId) {
      sendJson(ws, { type: "error", error: "pluginId is required" });
      return;
    }

    const agents = Array.isArray(frame.agents) ? frame.agents : [];
    const client = { ws, pluginId, agents, lastSeenAt: Date.now() };

    pluginClients.set(pluginId, client);
    socketMeta.set(ws, { kind: "plugin", id: pluginId });

    sendJson(ws, { type: "registered", ok: true });
    broadcastAgentList();
    return;
  }

  const meta = socketMeta.get(ws);
  const plugin = meta ? pluginClients.get(meta.id) : null;
  if (!plugin) {
    sendJson(ws, { type: "error", error: "plugin must register first" });
    return;
  }

  if (frame.type === "outgoing") {
    plugin.lastSeenAt = Date.now();
    routePluginOutgoing(plugin, frame);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const html = await readFile(path.join(__dirname, "public/index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const browserWss = new WebSocketServer({ noServer: true });
const pluginWss = new WebSocketServer({ noServer: true });

browserWss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const frame = parseJsonFrame(raw);
    if (!frame) return sendJson(ws, { type: "error", error: "invalid json" });
    handleBrowserFrame(ws, frame);
  });
});

pluginWss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const frame = parseJsonFrame(raw);
    if (!frame) return sendJson(ws, { type: "error", error: "invalid json" });
    handlePluginFrame(ws, frame);
  });
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit("connection", ws, req));
    return;
  }

  if (req.url === "/plugin") {
    pluginWss.handleUpgrade(req, socket, head, (ws) => pluginWss.emit("connection", ws, req));
    return;
  }

  socket.destroy();
});

function cleanupSocket(ws) {
  const meta = socketMeta.get(ws);
  if (!meta) return;

  socketMeta.delete(ws);
  if (meta.kind === "browser") browserClients.delete(meta.id);
  if (meta.kind === "plugin") {
    pluginClients.delete(meta.id);
    broadcastAgentList();
  }
}

for (const wss of [browserWss, pluginWss]) {
  wss.on("connection", (ws) => {
    ws.on("close", () => cleanupSocket(ws));
    ws.on("error", () => cleanupSocket(ws));
  });
}

server.listen(PORT, () => {
  console.log(`[webchat-server] listening on http://0.0.0.0:${PORT}`);
});
```

This is intentionally simple. Production deployments should add authentication, rate limiting, persistent offline queues, structured logs, and TLS termination.

## 5. Channel Plugin

The plugin follows the same shape as the WeCom reference:

- Store `api.runtime` through a runtime store.
- Register a channel with `api.registerChannel({ plugin })`.
- Start the channel gateway when OpenClaw starts the channel account.
- Connect outbound to `ws://CHAT_SERVER:3100/plugin`.
- Convert Chat Server `incoming` frames into OpenClaw inbound contexts.
- Send agent replies through `outbound.sendText`, which forwards `outgoing` frames to the Chat Server.

### `plugin/openclaw.plugin.json`

```json
{
  "id": "webchat-openclaw-plugin",
  "channels": ["webchat"],
  "configSchema": {
    "type": "object",
    "additionalProperties": true,
    "properties": {}
  }
}
```

### `plugin/src/const.js`

```js
export const CHANNEL_ID = "webchat";
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_CHAT_SERVER_URL = "ws://127.0.0.1:3100/plugin";
```

### `plugin/src/runtime.js`

Use the SDK runtime-store helper so hot paths can access OpenClaw runtime APIs without importing heavy startup code.

```js
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setWebChatRuntime, getRuntime: getWebChatRuntime } =
  createPluginRuntimeStore("WebChat runtime not initialized");

export { setWebChatRuntime, getWebChatRuntime };
```

### `plugin/index.js`

The register flow should stay small: set runtime, then register the channel.

```js
import { emptyPluginConfigSchema } from "./src/openclaw-compat.js";
import { webchatPlugin } from "./src/channel.js";
import { setWebChatRuntime } from "./src/runtime.js";

const plugin = {
  id: "webchat-openclaw-plugin",
  name: "WebChat",
  description: "Browser WebChat channel for OpenClaw",
  configSchema: emptyPluginConfigSchema(),

  register(api) {
    setWebChatRuntime(api.runtime);
    api.registerChannel({ plugin: webchatPlugin });
  },
};

export default plugin;
```

If `emptyPluginConfigSchema` is unavailable in the local SDK, replace it with:

```js
const emptyPluginConfigSchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {},
});
```

### `plugin/src/ws-client.js`

The WebSocket client owns the long connection to the Chat Server. It registers after connect, dispatches inbound frames to a callback, and exposes `sendToUser` for outbound replies.

```js
import WebSocket from "ws";
import { DEFAULT_CHAT_SERVER_URL } from "./const.js";

export class WebChatWsClient {
  constructor({ url, pluginId, agents, runtime, onIncoming }) {
    this.url = url || process.env.WEBCHAT_SERVER_URL || DEFAULT_CHAT_SERVER_URL;
    this.pluginId = pluginId;
    this.agents = agents;
    this.runtime = runtime;
    this.onIncoming = onIncoming;
    this.ws = null;
    this.closed = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.closed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this.runtime.log?.(`[webchat] connected to ${this.url}`);
      this.send({
        type: "register",
        pluginId: this.pluginId,
        agents: this.agents,
      });
    });

    this.ws.on("message", async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        this.runtime.error?.("[webchat] invalid JSON frame from Chat Server");
        return;
      }

      if (frame.type === "registered") {
        this.runtime.log?.("[webchat] Chat Server registration accepted");
        return;
      }

      if (frame.type === "incoming") {
        await this.onIncoming(frame);
        return;
      }

      if (frame.type === "agent_list_update") {
        this.runtime.log?.(`[webchat] agent list update: ${JSON.stringify(frame.agents || [])}`);
      }
    });

    this.ws.on("close", () => this.scheduleReconnect());
    this.ws.on("error", (err) => {
      this.runtime.error?.(`[webchat] ws error: ${err.message}`);
    });
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  sendToUser({ userId, agentId, content }) {
    return this.send({
      type: "outgoing",
      userId,
      pluginId: this.pluginId,
      agentId,
      content,
    });
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
```

### `plugin/src/channel.js`

The channel plugin defines metadata, outbound behavior, and gateway startup. The important parts are:

- `outbound.sendText(...)` translates core replies into Chat Server `outgoing` frames.
- `gateway.startAccount(...)` creates the long-lived WebSocket client.
- Incoming Chat Server frames are converted into OpenClaw inbound contexts and dispatched.

```js
import { DEFAULT_ACCOUNT_ID, CHANNEL_ID } from "./const.js";
import { getWebChatRuntime } from "./runtime.js";
import { WebChatWsClient } from "./ws-client.js";

const clients = new Map();

function resolveWebChatConfig(cfg, accountId = DEFAULT_ACCOUNT_ID) {
  const channelCfg = cfg.channels?.[CHANNEL_ID] || {};
  const accounts = channelCfg.accounts || {};
  const accountCfg = accounts[accountId] || channelCfg;

  return {
    accountId,
    enabled: accountCfg.enabled !== false,
    serverUrl: accountCfg.serverUrl || process.env.WEBCHAT_SERVER_URL,
    agents: accountCfg.agents || [{ agentId: "nezha", name: "哪吒" }],
  };
}

async function dispatchIncoming({ frame, cfg, account, runtime }) {
  const core = getWebChatRuntime();
  const agentId = frame.agentId || account.agents[0]?.agentId || "default";
  const userId = String(frame.userId || "").trim();
  const userName = String(frame.userName || userId).trim();
  const content = String(frame.content || "");

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: userId,
    },
    agentId,
  });

  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: content,
    RawBody: content,
    CommandBody: content,
    MessageSid: frame.messageId || `webchat-${Date.now()}`,
    From: `${CHANNEL_ID}:${userId}`,
    To: `${CHANNEL_ID}:${agentId}`,
    SenderId: userId,
    SenderName: userName,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: `user:${userId}`,
    Timestamp: Date.now(),
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `${CHANNEL_ID}:${userId}`,
    CommandAuthorized: true,
    WebChatFrame: frame,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey || route.sessionKey,
    ctx: ctxPayload,
    updateLastRoute: {
      sessionKey: route.mainSessionKey,
      channel: CHANNEL_ID,
      to: `${CHANNEL_ID}:${userId}`,
      accountId: route.accountId,
    },
    onRecordError: (err) => {
      runtime.error?.(`[webchat] failed updating session meta: ${String(err)}`);
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      deliver: async (payload, info) => {
        runtime.log?.(
          `[openclaw -> webchat] kind=${info.kind}, payload=${JSON.stringify(payload)}`,
        );
      },
      onError: (err, info) => {
        runtime.error?.(`[webchat] ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });
}

export const webchatPlugin = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "WebChat",
    selectionLabel: "WebChat",
    detailLabel: "Browser WebChat channel",
    docsPath: `/channels/${CHANNEL_ID}`,
    docsLabel: CHANNEL_ID,
    blurb: "Chat with OpenClaw agents from a browser",
    systemImage: "message.fill",
    quickstartAllowFrom: true,
  },

  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },

  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },

  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.[CHANNEL_ID]?.accounts;
      return accounts ? Object.keys(accounts) : [DEFAULT_ACCOUNT_ID];
    },
    resolveAccount: (cfg, accountId) => resolveWebChatConfig(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => Boolean(account.serverUrl),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: Boolean(account.serverUrl),
      serverUrl: account.serverUrl,
      agents: account.agents,
    }),
    resolveAllowFrom: () => ["*"],
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
  },

  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: ["*"],
      reason: "WebChat browser access is controlled by the Chat Server",
    }),
    collectWarnings: () => [],
  },

  messaging: {
    normalizeTarget: (target) => target.trim() || undefined,
    targetResolver: {
      looksLikeId: (id) => Boolean(id?.trim()),
      hint: "<webchat-user-id>",
    },
  },

  outbound: {
    deliveryMode: "gateway",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const resolvedAccountId = accountId || DEFAULT_ACCOUNT_ID;
      const userId = String(to || "").replace(new RegExp(`^${CHANNEL_ID}:`, "i"), "");
      const client = clients.get(resolvedAccountId);

      if (!client) {
        throw new Error(`WebChat client not connected for account ${resolvedAccountId}`);
      }

      const ok = client.sendToUser({
        userId,
        agentId: "nezha",
        content: text,
      });

      if (!ok) {
        throw new Error("Chat Server WebSocket is not open");
      }

      return {
        channel: CHANNEL_ID,
        messageId: `webchat-${Date.now()}`,
        chatId: userId,
      };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: () => [],
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: Boolean(account.serverUrl),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = resolveWebChatConfig(ctx.cfg, ctx.accountId);
      ctx.log?.info(`starting webchat[${ctx.accountId}] server=${account.serverUrl}`);

      const client = new WebChatWsClient({
        url: account.serverUrl,
        pluginId: "webchat-channel",
        agents: account.agents,
        runtime: ctx.runtime,
        onIncoming: (frame) =>
          dispatchIncoming({
            frame,
            cfg: ctx.cfg,
            account,
            runtime: ctx.runtime,
          }),
      });

      clients.set(ctx.accountId, client);
      client.connect();

      await new Promise((resolve) => {
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            client.close();
            clients.delete(ctx.accountId);
            resolve();
          },
          { once: true },
        );
      });
    },
  },
};
```

The WeCom reference has richer media handling, queueing, setup, multi-account resolution, and policy checks. WebChat should start with the same lifecycle pattern but keep the implementation narrow until those features are needed.

## 6. Configuration

Minimal OpenClaw channel config:

```json
{
  "channels": {
    "webchat": {
      "enabled": true,
      "serverUrl": "ws://127.0.0.1:3100/plugin",
      "agents": [
        { "agentId": "nezha", "name": "哪吒" }
      ]
    }
  }
}
```

For multi-instance deployments:

```json
{
  "channels": {
    "webchat": {
      "accounts": {
        "home": {
          "enabled": true,
          "serverUrl": "wss://chat.example.com/plugin",
          "agents": [{ "agentId": "nezha-home", "name": "哪吒 Home" }]
        },
        "office": {
          "enabled": true,
          "serverUrl": "wss://chat.example.com/plugin",
          "agents": [{ "agentId": "nezha-office", "name": "哪吒 Office" }]
        }
      }
    }
  }
}
```

## 7. Browser Client

A minimal browser page can register, render agents, and send messages to the selected plugin.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WebChat3.0</title>
  </head>
  <body>
    <select id="agent"></select>
    <div id="log"></div>
    <input id="input" autocomplete="off" />
    <button id="send">Send</button>

    <script>
      const userId = localStorage.webchatUserId || `u_${Date.now()}`;
      localStorage.webchatUserId = userId;

      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      const agentSelect = document.querySelector("#agent");
      const log = document.querySelector("#log");
      const input = document.querySelector("#input");

      function append(line) {
        const div = document.createElement("div");
        div.textContent = line;
        log.appendChild(div);
      }

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "register", userId, userName: userId }));
      });

      ws.addEventListener("message", (event) => {
        const frame = JSON.parse(event.data);

        if (frame.type === "agent_list") {
          agentSelect.innerHTML = "";
          for (const agent of frame.agents) {
            const option = document.createElement("option");
            option.value = `${agent.pluginId}:${agent.agentId}`;
            option.textContent = `${agent.name} (${agent.pluginId})`;
            agentSelect.appendChild(option);
          }
          return;
        }

        if (frame.type === "message") {
          append(`${frame.from}: ${frame.content}`);
        }
      });

      document.querySelector("#send").addEventListener("click", () => {
        const [pluginId, agentId] = agentSelect.value.split(":");
        const content = input.value.trim();
        if (!content) return;
        append(`me: ${content}`);
        ws.send(JSON.stringify({ type: "message", pluginId, agentId, content }));
        input.value = "";
      });
    </script>
  </body>
</html>
```

## 8. Deployment

### Local Development

Run the server:

```bash
cd server
npm install
PORT=3100 npm start
```

Configure the plugin:

```bash
export WEBCHAT_SERVER_URL=ws://127.0.0.1:3100/plugin
openclaw channels start webchat
```

Open the browser at:

```text
http://127.0.0.1:3100/
```

### Public Deployment

Deploy the Chat Server on a machine with a public address:

```bash
PORT=3100 node server/src/index.js
```

Put Nginx or another reverse proxy in front of it for TLS:

```nginx
server {
  listen 443 ssl;
  server_name chat.example.com;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }

  location /ws {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location /plugin {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

Then set plugin instances to:

```bash
export WEBCHAT_SERVER_URL=wss://chat.example.com/plugin
```

### Production Hardening

Add these before exposing the server to untrusted users:

- Authentication for `/plugin`, such as a bearer token in the WebSocket query string or first register frame.
- Authentication or session signing for `/ws`.
- Rate limits per `userId` and IP address.
- Heartbeat ping/pong and stale connection cleanup.
- Offline message handling or explicit offline errors.
- Persistent agent registry if plugin reconnects should survive process restarts.
- Structured logs with `userId`, `pluginId`, `agentId`, and `messageId`.
- Origin checks for browser WebSocket connections.

## 9. Implementation Checklist

1. Build `server/src/index.js` with HTTP + WebSocket on port `3100`.
2. Maintain `browserClients`, `pluginClients`, and `socketMeta` as `Map` instances.
3. Serve browser traffic at `/` and browser WebSocket traffic at `/ws`.
4. Accept plugin WebSocket traffic at `/plugin`.
5. Implement `register`, `incoming`, `outgoing`, and `agent_list` protocol frames.
6. Create `plugin/openclaw.plugin.json` with channel id `webchat`.
7. In `plugin/index.js`, call `setWebChatRuntime(api.runtime)` and `api.registerChannel({ plugin: webchatPlugin })`.
8. In `src/runtime.js`, use `createPluginRuntimeStore`.
9. In `src/ws-client.js`, connect to the Chat Server, register the plugin, handle reconnect, and expose `sendToUser`.
10. In `src/channel.js`, implement `gateway.startAccount`, dispatch incoming frames through OpenClaw core, and implement `outbound.sendText`.
11. Deploy Chat Server publicly and configure each OpenClaw plugin instance with `wss://HOST/plugin`.
