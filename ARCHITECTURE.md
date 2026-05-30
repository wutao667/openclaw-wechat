# WebChat3.0 架构方案

## 核心思路

WebChat 是一个 **OpenClaw Channel Plugin**，对标飞书和企微 channel，让用户通过浏览器直接和 OpenClaw Agent 对话。

**关键设计决策：Plugin 主动连 Chat Server（长连接），而不是 Chat Server 调 Plugin（webhook）。** 这样内网的 OpenClaw 实例也能用。

---

## 架构总览

```
┌────────────────────────────────────────────────────────┐
│                  用户端（浏览器）                         │
│  连接 Chat Server → 发消息 → 收回复                       │
└─────────────────────┬──────────────────────────────────┘
                      │ WebSocket
                      ▼
┌────────────────────────────────────────────────────────┐
│                Chat Server（公网）                       │
│                                                        │
│  职责：                                                │
│  - 管理浏览器 WebSocket 连接（心跳、重连、离线缓存）       │
│  - 管理 Plugin WebSocket 连接（接收 plugin 注册）         │
│  - 路由：浏览器消息 → 转发给对应的 Plugin                  │
│  - 推送：Plugin 回复 → 转发给浏览器                       │
│                                                        │
│  端口 :3100（HTTP + WebSocket）                         │
│  可部署在有公网 IP 的服务器上                              │
└─────────────────────┬──────────────────────────────────┘
                      │ ↑ WebSocket（长连接）
                      │ Plugin 主动连 Chat Server
                      │（内网机器也能出站连接）
                      ▼
┌────────────────────────────────────────────────────────┐
│              WebChat Channel Plugin                     │
│                                                        │
│  职责：                                                │
│  - 注册为 OpenClaw channel（api.registerChannel）        │
│  - 启动时主动 WS 连 Chat Server                          │
│  - 收到 Chat Server 的消息 → Core dispatch              │
│  - Core 回复 → 通过 WS 发回 Chat Server                  │
│                                                        │
│  写法对标飞书 WebSocket 模式                              │
└─────────────────────┬──────────────────────────────────┘
                      │ 标准 channel dispatch
                      ▼
┌────────────────────────────────────────────────────────┐
│                OpenClaw Core / Agent                     │
│                                                        │
│  处理消息，回复走标准 outbound.send()                     │
└────────────────────────────────────────────────────────┘
```

---

## 连接模型

### Plugin 注册连接

```
Plugin 启动时：
1. 主动连 Chat Server 的 WS（ws://chat-server:3100/plugin）
2. 发送注册消息：{ type: "register", pluginId: "webchat-channel", agents: ["nezha"] }
3. Chat Server 确认：{ type: "registered", ok: true }
4. 连接持久保持
```

### 浏览器连接

```
浏览器打开页面时：
1. 主动连 Chat Server 的 WS（wss://test.huaguo.site/ws）
2. 发送注册消息：{ type: "register", userId: "xxx", userName: "吴涛" }
3. Chat Server 返回 agent 列表
4. 连接持久保持
```

---

## 消息流程

### 用户发消息 → Agent 回复

```
浏览器 ──WS──→ Chat Server
                  │
                  │ 找到用户对应的 Plugin WS 连接
                  │
                  ├──(WS push)──→ Plugin
                  │                 │ dispatch
                  │                 ▼
                  │              Core → Agent
                  │                 │ reply
                  │                 ▼
                  │              outbound.send()
                  │                 │
                  ├──(WS push)──←──┘
                  │
                  └───WS──→ 浏览器
```

**详细步骤：**

1. 浏览器发消息 `{ type: "message", content: "你好" }`
2. Chat Server 通过 WS 推给 Plugin：`{ type: "incoming", userId: "xxx", content: "你好" }`
3. Plugin 收到 → Core dispatch（标准 dispatch 链）
4. Agent 处理 → 回复 → Core 回调 `outbound.send()`
5. Plugin 的 `outbound.send()` 通过 WS 发回 Chat Server：`{ type: "outgoing", userId: "xxx", content: "我是哪吒" }`
6. Chat Server 推给对应的浏览器

---

## 接口/协议定义

### Plugin ↔ Chat Server（WS 长连接）

Plugin 连接地址：`ws://CHAT_SERVER_HOST:3100/plugin`

**Plugin → Chat Server：**

```json
// 注册
{ "type": "register", "pluginId": "nezha-plugin", "agents": ["nezha"] }

// 转发回复给用户
{ "type": "outgoing", "userId": "u_xxx", "content": "我是哪吒" }
```

**Chat Server → Plugin：**

```json
// 注册确认
{ "type": "registered", "ok": true }

// 用户消息
{ "type": "incoming", "userId": "u_xxx", "userName": "吴涛", "content": "你好" }

// agent 列表更新
{ "type": "agent_list_update", "agents": [{"agentId": "nezha", "name": "哪吒"}] }
```

### 浏览器 ↔ Chat Server（WS 长连接）

浏览器连接地址：`wss://test.huaguo.site/ws`

**浏览器 → Chat Server：**

```json
// 注册
{ "type": "register", "userId": "u_xxx", "userName": "吴涛" }

// 发消息
{ "type": "message", "content": "你好" }
```

**Chat Server → 浏览器：**

```json
// 注册确认
{ "type": "registered", "userId": "u_xxx" }

// agent 列表
{ "type": "agent_list", "agents": [{"agentId": "nezha", "name": "哪吒"}] }

// 收到回复
{ "type": "message", "from": "agent:nezha", "content": "我是哪吒" }
```

---

## 和飞书/企微的对照

| | 飞书 | 企微 | WebChat |
|---|---|---|---|
| **连接方向** | Plugin 连飞书 WS | **Plugin 连企微 WS** | **Plugin 连 Chat Server WS** |
| **通信方式** | WS 长连接 | WS 长连接 | **WS 长连接** |
| **内网友好？** | ✅ | ✅ | ✅ |
| **Plugin 需要公网IP？** | ❌ 不需要 | ❌ 不需要 | ❌ 不需要 |
| **谁主动** | Plugin 主动连 | Plugin 主动连 | Plugin 主动连 |

---

## 多实例场景

```
     浏览器 ──┐
     浏览器 ──┼── Chat Server（公网 :3100）
     浏览器 ──┘     │
              ┌─────┼─────┐
              │     │     │
           Plugin1 Plugin2 Plugin3
           (本机)  (云主机) (内网机器)
              │        │       │
           OpenClaw  OpenClaw  OpenClaw
```

所有 Plugin 都**主动 WS 连接**到公网 Chat Server。浏览器连 Chat Server 后，选择一个 OpenClaw 实例的 agent 对话。Chat Server 根据 pluginId 路由消息。

---

## 开发路线

### Phase 1：Chat Server（基础版）
- HTTP + WS 服务，`:3100`
- 接受浏览器 WS 连接
- 接受 Plugin WS 连接
- 消息路由：浏览器 ↔ Plugin
- 简单前端页面（发消息 + 看回复）

### Phase 2：Channel Plugin
- 标准 `api.registerChannel()` + `outbound.send()`
- 启动时 WS 连 Chat Server
- 收到 message → Core dispatch
- Core 回复 → 通过 WS 发回 Chat Server

### Phase 3：集成测试 & 多实例
