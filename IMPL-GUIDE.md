# WebChat3.0 实现指南

## 概述

Plugin **主动**通过 WebSocket 连接 Chat Server（长连接），而不是 Chat Server 调 Plugin 的 webhook。

这样内网的 OpenClaw 实例也能用——Plugin 出站连公网 Chat Server，不需要公网 IP。

---

## 一、Chat Server

> 项目目录：`/home/wutao/.openclaw/workspace-nezha/webchat3.0/server/`

### 职责
- HTTP + WebSocket 服务，监听 `:3100`
- 接受浏览器 WS 连接（`/ws`）
- 接受 Plugin WS 连接（`/plugin`）
- 消息路由：浏览器 ↔ 对应 Plugin
- 简单前端页面

### 连接管理

```js
// Chat Server 内部维护两个映射

// 浏览器连接：userId → ws
const browserConns = new Map();

// Plugin 连接：pluginId → ws
const pluginConns = new Map();

// 用户归属：userId → pluginId（哪个 plugin 服务这个用户）
const userPluginMap = new Map();
```

### WS 路由逻辑

```
收到浏览器消息：
  1. 查 userPluginMap.get(userId) 找到对应的 plugin
  2. 通过 pluginConns 里对应的 WS 推给 plugin
  3. 如果没有 plugin 在线，返回错误

收到 Plugin 消息：
  1. 解析 userId
  2. 通过 browserConns 里对应的 WS 推给浏览器
```

### 消息流代码示意

```js
// 浏览器 WS
wss.on('connection', (ws, req) => {
  if (req.url === '/ws') {
    // 浏览器连接
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'register') {
        browserConns.set(msg.userId, ws);
        // 分配一个 plugin（目前简单处理：取第一个在线 plugin）
        userPluginMap.set(msg.userId, 'nezha-plugin');
        // 回复 agent 列表
        ws.send(JSON.stringify({ type: 'agent_list', agents: onlineAgents() }));
      }
      if (msg.type === 'message') {
        // 找到对应的 plugin，转发
        const pluginId = userPluginMap.get(ws.userId);
        const pluginWs = pluginConns.get(pluginId);
        pluginWs.send(JSON.stringify({
          type: 'incoming',
          userId: ws.userId,
          userName: ws.userName,
          content: msg.content,
        }));
      }
    });
  }

  if (req.url === '/plugin') {
    // Plugin 连接
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'register') {
        pluginConns.set(msg.pluginId, ws);
        // 广播给所有浏览器：agent 列表更新
        broadcastAgentList();
      }
      if (msg.type === 'outgoing') {
        // Plugin 回复，推给浏览器
        const browserWs = browserConns.get(msg.userId);
        browserWs.send(JSON.stringify({
          type: 'message',
          from: 'agent:nezha',
          content: msg.content,
        }));
      }
    });
  }
});
```

---

## 二、Channel Plugin

> 项目目录：`/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/`

### 标准结构

```
plugin/
├── openclaw.plugin.json
├── package.json              # "type": "module"
├── index.js                  # 入口：register(api)
└── src/
    ├── channel.js            # channel 定义（registerChannel）
    ├── ws-client.js          # WS 客户端，连 Chat Server
    └── runtime.js            # runtime 存储
```

### register 流程

```js
// index.js
import webchatPlugin from './src/channel.js';
import { connectToChatServer } from './src/ws-client.js';
import { setRuntime } from './src/runtime.js';

const plugin = {
  id: 'webchat-channel',
  name: 'WebChat Channel',
  configSchema: {
    type: 'object',
    properties: {
      chatServerUrl: { type: 'string', default: 'ws://127.0.0.1:3100/plugin' },
      pluginId: { type: 'string', default: 'nezha-plugin' },
    },
  },

  register(api) {
    setRuntime(api.runtime);

    // 注册为 OpenClaw channel
    api.registerChannel({ plugin: webchatPlugin });

    // 主动 WS 连 Chat Server
    connectToChatServer({
      url: api.config.chatServerUrl || 'ws://127.0.0.1:3100/plugin',
      pluginId: api.config.pluginId || 'nezha-plugin',
      runtime: api.runtime,
    });
  },
};

export default plugin;
```

### Channel 定义

```js
// src/channel.js
const webchatPlugin = {
  id: 'webchat-channel',
  meta: { /* 元数据 */ },

  capabilities: ['outbound'],

  listAccountIds: () => ['default'],

  resolveAccount: (accountId) => ({
    accountId: 'default',
    config: {},
  }),

  defaultAccountId: 'default',

  agentPrompt: {
    messageToolHints: { onSend: 'static' },
  },

  outbound: {
    async send({ message, conversation }) {
      // Core 回复了 → 通过 WS 发回 Chat Server
      const userId = conversation?.peerId;
      if (!userId || !message.text) return;

      // 通过 ws-client 模块的 WS 连接发出去
      const { sendToChatServer } = await import('./ws-client.js');
      sendToChatServer({
        type: 'outgoing',
        userId,
        content: message.text,
      });
    },
  },
};

export default webchatPlugin;
```

### WS 客户端

```js
// src/ws-client.js
let _ws = null;

export function connectToChatServer({ url, pluginId, runtime }) {
  _ws = new WebSocket(url);

  _ws.on('open', () => {
    console.log('[webchat] connected to Chat Server');
    _ws.send(JSON.stringify({
      type: 'register',
      pluginId,
      agents: ['nezha'],
    }));
  });

  _ws.on('message', async (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === 'incoming') {
      // 收到用户消息 → dispatch 到 Core
      await dispatchToCore({
        runtime,
        userId: msg.userId,
        userName: msg.userName,
        content: msg.content,
      });
    }
  });

  _ws.on('close', () => {
    console.log('[webchat] disconnected, reconnecting in 5s...');
    setTimeout(() => connectToChatServer({ url, pluginId, runtime }), 5000);
  });

  _ws.on('error', (err) => {
    console.error('[webchat] ws error:', err.message);
  });
}

export function sendToChatServer(data) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(data));
  }
}

async function dispatchToCore({ runtime, userId, userName, content }) {
  const core = runtime;

  // 标准 dispatch 链（参考飞书/企微的做法）
  // resolveAgentRoute → finalizeInboundContext → recordInboundSession → dispatchReplyWithBufferedBlockDispatcher
  // ...
}
```

---

## 三、和之前架构的差异

| | webchat2.0 | webchat3.0 (v1) Webhook | webchat3.0 (v2) 长连接 |
|---|---|---|---|
| **Plugin 连谁** | 自己开 WS | 被动等 webhook | **主动连 Chat Server** |
| **Chat Server 连谁** | 不需要 | 主动调 Plugin | **等 Plugin 来连** |
| **内网可用？** | — | ❌ 需要公网IP | **✅ 可出站就行** |
| **对标飞书** | — | HTTP webhook 模式 | **WebSocket 长连模式** |
| **多实例支持** | ❌ | ❌ | ✅ 多个 Plugin 连同一个 Chat Server |

---

## 四、部署方案

### 本地开发

```bash
# 终端 1：Chat Server
cd webchat3.0/server && node server.js

# 终端 2：Plugin（通过 openclaw plugins install --link）
# Plugin 配置 chatServerUrl=ws://127.0.0.1:3100/plugin
```

### 生产部署

```
Chat Server（公网服务器 :3100）
  - Caddy 反代 test.huaguo.site → :3100
  - 浏览器连 wss://test.huaguo.site/ws
  - Plugin 连 ws://test.huaguo.site/plugin（或内网穿透）

Plugin（任何机器，包括内网）
  - 配置 chatServerUrl=ws://CHAT_SERVER_PUBLIC_IP:3100/plugin
  - 主动出站连接，不需要入站端口
```
