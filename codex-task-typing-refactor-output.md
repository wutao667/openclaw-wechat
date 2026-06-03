# typing_start 触发机制重构调研报告

## 结论摘要

- 改名后 `OriginatingChannel === "openclaw-webchat"` 不再命中 SDK hardcoded `webchat` typing suppress 分支，SDK 的 `onReplyStart` 路径可以恢复。
- `dispatchReplyWithBufferedBlockDispatcher({ dispatcherOptions: { onReplyStart } })` 是有效写法；buffered dispatcher 内部会调用 `createReplyDispatcherWithTyping`，插件不需要自己额外包装。
- 触发时机不是浏览器发消息瞬间，而是 SDK typing signal 触发时。默认 direct chat 下 `typingMode = "instant"`，普通 LLM 流式路径主要在首个可渲染 text delta 触发，因此会比当前手动 workaround 晚。
- 如果保留当前手动 `sendTypingEvent(start)`，同时再加 SDK `onReplyStart`，会存在重复 start；当前 `deliver` 里的 fallback 也会继续补发 start。

## Q1：改名后 SDK 的 `onReplyStart` 钩子现在能用了吗？

### hardcoded `webchat` 分支

SDK 当前实际 chunk 名称不是题目里的旧 hash，而是：

- `plugin/node_modules/openclaw/dist/typing-policy-CUUukWqw.js`
- `plugin/node_modules/openclaw/dist/typing-mode-DywjWPyn.js`
- `plugin/node_modules/openclaw/dist/dispatch-DphqeP-y.js`
- `plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js`
- `plugin/node_modules/openclaw/dist/reply-dispatcher-BBvGHj5K.js`
- `plugin/node_modules/openclaw/dist/provider-dispatcher-BrBUepR3.js`

`resolveRunTypingPolicy` 只在 `params.originatingChannel === "webchat"` 时设为 `internal_webchat`，并把 `suppressTyping` 置 true：[typing-policy-CUUukWqw.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/typing-policy-CUUukWqw.js:191)。

当前 plugin 已经把 `CHANNEL_ID` 改成 `"openclaw-webchat"`：[plugin/src/const.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/const.js:3)，`OriginatingChannel` 也来自 `CHANNEL_ID`：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:95)。因此 `originatingChannel === "openclaw-webchat"` 时不会命中 `internal_webchat`。

另一个 route decision 也只在 `originatingChannel === "webchat"` 时 suppress：[dispatch-DphqeP-y.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/dispatch-DphqeP-y.js:103)。`openclaw-webchat` 同样不命中。

`typing-mode` 在 `typingPolicy === "internal_webchat"` 或 `suppressTyping` 时返回 `"never"`：[typing-mode-DywjWPyn.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/typing-mode-DywjWPyn.js:14)。改名后默认 direct chat 会走 `instant`：非 group 或被 mention 时返回 `"instant"`：[typing-mode-DywjWPyn.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/typing-mode-DywjWPyn.js:18)。

### `dispatcherOptions.onReplyStart` 是否会传给 typing controller

会。

调用链：

1. `dispatchReplyWithBufferedBlockDispatcher` 把 `params.dispatcherOptions` 原样传给 buffered dispatcher：[provider-dispatcher-BrBUepR3.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/provider-dispatcher-BrBUepR3.js:3)。
2. buffered dispatcher 内部调用 `createReplyDispatcherWithTyping({ ...params.dispatcherOptions, deliver, beforeDeliver, ... })`：[dispatch-DphqeP-y.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/dispatch-DphqeP-y.js:2006)。
3. `createReplyDispatcherWithTyping` 从 options 里提取 `onReplyStart`，生成 `replyOptions.onReplyStart`：[reply-dispatcher-BBvGHj5K.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/reply-dispatcher-BBvGHj5K.js:156)。
4. buffered dispatcher 调用 `dispatchInboundMessage` 时合并 `replyOptions`，并且 `...replyOptions` 在 `...params.replyOptions` 后面，所以 typing wrapper 生成的 `onReplyStart` 会覆盖外部同名 `replyOptions`：[dispatch-DphqeP-y.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/dispatch-DphqeP-y.js:2019)。
5. `getReplyFromConfig` 创建 typing controller 时使用 `opts?.onReplyStart`：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:4725)。

所以结论是：直接在 `dispatcherOptions` 里加 `onReplyStart` 有效，不需要 plugin 自己调用 `createReplyDispatcherWithTyping`。

### 触发时机

不是 dispatch 函数一启动就无条件触发。

SDK 先解析 typing policy 和 typing mode：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:3003)。空输入特殊路径会直接 `typing.onReplyStart()`：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:3129)。

普通 agent run 路径把 `typingMode` 传给 agent runner：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:3588)。agent runner 创建 `typingSignals`：[agent-runner.runtime-ClBHCqn2.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/agent-runner.runtime-ClBHCqn2.js:2963)。

默认 direct chat 的 `instant` 模式里：

- `signalRunStart` 可以立即 `startTypingLoop`：[typing-mode-DywjWPyn.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/typing-mode-DywjWPyn.js:34)。
- `signalTextDelta` 遇到可渲染文本会 `startTypingOnText`：[typing-mode-DywjWPyn.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/typing-mode-DywjWPyn.js:43)。
- 流式 partial 文本路径在 `handlePartialForTyping` 里调用 `signalTextDelta(text)`：[reply-turn-admission-BaGuBaDP.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/reply-turn-admission-BaGuBaDP.js:1296)。

因此普通 LLM 流式回复更接近“第一个可渲染 text delta/第一 byte 后触发”，不是浏览器发消息瞬间。另有一些非普通路径可能在 run/preflight 或已有 payload 时调用 `signalRunStart`：[agent-runner.runtime-ClBHCqn2.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/agent-runner.runtime-ClBHCqn2.js:226)、[agent-runner.runtime-ClBHCqn2.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/agent-runner.runtime-ClBHCqn2.js:3120)。

### 重复触发可能性

typing controller 内部有 guard：`started` 防止同一 controller 重复 start，`triggerInFlight` 防止并发重复：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:4396)，`ensureStart` 在已 started 时返回：[get-reply-9dLyvuw9.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/node_modules/openclaw/dist/get-reply-9dLyvuw9.js:4468)。

但这个 guard 只保护 SDK controller 内部。plugin 当前手动 `sendTypingEvent(start)` 不受 SDK guard 管控：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:141)，`deliver` 里还会补发一次 start：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:156)。如果再加 SDK `onReplyStart`，浏览器端可能收到 2 到 3 个 `typing_start`。

## Q2：飞书/企业微信是哪种模式？

### 飞书

飞书主 IM/card 流程不是直接用 `dispatcherOptions.onReplyStart`；它先调用 `createFeishuReplyDispatcher`：[reference/feishu-plugin/messaging/inbound/dispatch.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/messaging/inbound/dispatch.js:203)，再把返回的 `dispatcher` 和 `replyOptions` 传给 `dispatchReplyFromConfig`：[reference/feishu-plugin/messaging/inbound/dispatch.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/messaging/inbound/dispatch.js:226)。

`createFeishuReplyDispatcher` 内部调用 SDK `createReplyDispatcherWithTyping`：[reference/feishu-plugin/card/reply-dispatcher.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/card/reply-dispatcher.js:169)，并在 `onReplyStart` 里调用 reaction-based typing callback：[reference/feishu-plugin/card/reply-dispatcher.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/card/reply-dispatcher.js:173)。返回结果包含 `replyOptions`：[reference/feishu-plugin/card/reply-dispatcher.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/card/reply-dispatcher.js:393)。

所以飞书主流程是“自定义 dispatcher + `createReplyDispatcherWithTyping`”。触发时机仍由 SDK typing signals 决定，普通 LLM 流式路径通常等首个可渲染文本 delta，而不是 inbound dispatch 一开始。

飞书 comment/system/synthetic 等 plain-text fallback 路径直接用 `dispatchReplyWithBufferedBlockDispatcher`，但没有配置 `onReplyStart`：[reference/feishu-plugin/messaging/inbound/dispatch.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/messaging/inbound/dispatch.js:67)、[reference/feishu-plugin/messaging/inbound/dispatch-commands.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/feishu-plugin/messaging/inbound/dispatch-commands.js:88)。

### 企业微信

WeCom monitor 流程直接使用 `dispatchReplyWithBufferedBlockDispatcher`，在 `dispatcherOptions.onReplyStart` 里发 thinking reply：[reference/wecom-plugin/src/monitor.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/wecom-plugin/src/monitor.js:364)。该钩子具体发送逻辑在 [reference/wecom-plugin/src/monitor.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/wecom-plugin/src/monitor.js:375)。

WeCom 这个路径没有显式调用 `createReplyDispatcherWithTyping`，但 SDK buffered dispatcher 会内部包装，所以能工作。触发时机同样由 SDK typing signals 决定；普通 LLM 流式路径通常是首个可渲染文本 delta。用户观测到“飞书/企业微信圆点等几秒才出现”与该机制一致。

WeCom 其它路径不一定配置 `onReplyStart`，例如 agent handler 只有 `deliver`：[reference/wecom-plugin/src/agent/handler.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/wecom-plugin/src/agent/handler.js:429)，webhook monitor 也只展示 `deliver`：[reference/wecom-plugin/src/webhook/monitor.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/reference/wecom-plugin/src/webhook/monitor.js:645)。

## Q3：plugin 端需要怎么改？仅建议，不应用

### 建议方向

移除 dispatch 前的手动 `sendTypingEvent(start)`，改为把 start 放进 `dispatcherOptions.onReplyStart`。保留 `deliver` 里的 first-text fallback 可以作为兜底，但它会使首个文本到达时再补发一次 start；如果浏览器端对重复 start 幂等，可以保留。若希望事件最干净，可以保留 `firstTextSent` 但用一个 `typingStarted` 标志避免重复。

不需要 plugin 调用 `createReplyDispatcherWithTyping`。原因是 `dispatchReplyWithBufferedBlockDispatcher` 内部已经调用它，并且会从 `dispatcherOptions` 提取 `onReplyStart`。

### 具体 diff 建议

不要应用，供实现时参考：

```diff
diff --git a/plugin/src/ws-client.js b/plugin/src/ws-client.js
@@
-  // 绕开 SDK 的 internal_webchat 抑制策略：在本地直接发 typing_start。
-  // SDK 对 OriginatingChannel === "webchat" 强制 suppressTyping，导致
-  // dispatcherOptions.onReplyStart 永远不会被调用。
-  sendTypingEvent({ kind: "start", account, userId });
-  runtime?.log?.(`[webchat] reply started user=${userId} agent=${agentId}`);
+  let typingStarted = false;
+  const startTyping = () => {
+    if (typingStarted) return;
+    typingStarted = true;
+    sendTypingEvent({ kind: "start", account, userId });
+    runtime?.log?.(`[webchat] reply started user=${userId} agent=${agentId}`);
+  };
   let firstTextSent = false;
@@
     dispatcherOptions: {
+      onReplyStart: async () => {
+        startTyping();
+      },
       deliver: async (payload) => {
@@
         if (!firstTextSent) {
           firstTextSent = true;
-          // fallback：万一前面的 start 失败，这里再补发一次
-          sendTypingEvent({ kind: "start", account, userId });
+          // fallback：万一 SDK onReplyStart 没触发，这里再补发一次
+          startTyping();
         }
```

### deliver fallback 保留还是移除

建议短期保留 fallback，但加 `typingStarted` 去重。理由：

- SDK `onReplyStart` 恢复后，普通路径会在首个可渲染文本前后触发；如果某些特殊路径没有触发，deliver fallback 还能保证首条消息前发 start。
- 当前 fallback 已存在：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:156)。只要加去重，就不会造成重复。
- 如果目标是完全对齐飞书/WeCom 的“等 LLM 首个输出”体验，fallback 可以保留但实际很少晚于 SDK start；如果目标是减少事件数量，可移除 fallback。

## Q4：风险评估

### SDK 钩子和手动发送同时存在

会有重复 start 风险。当前 dispatch 前手动 start：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:141)，deliver first-text fallback：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:156)，再加 SDK `onReplyStart` 就会多路触发。SDK 自身 guard 不能拦截 plugin 的外部手动事件。

### 钩子不触发的 fallback

推荐 fallback 是 `deliver` 首个可见 text 时调用 `startTyping()`，并用本地 `typingStarted` 去重。这样即使 SDK typing policy、特殊 silent/tool-only 路径、hook 抢占等导致 `onReplyStart` 未触发，首条实际消息发送前仍会补一次 start。

### 老 user / 老 session 兼容

主要兼容点不是 user，而是 session route metadata。当前 plugin `recordInboundSession` 会用 `channel: CHANNEL_ID` 更新 last route：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:126)。新消息进来时会写入 `openclaw-webchat`。旧 session 文件中可能残留 `webchat` last route，但本次 inbound ctx 的 `Provider/Surface/OriginatingChannel` 已经是 `openclaw-webchat`：[plugin/src/ws-client.js](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/src/ws-client.js:95)。本次 typing policy 以当前 route/context 为准，风险较低。

如果没有新 inbound、只靠旧 session 的 outbound/followup route，则可能仍使用旧 channel metadata。这不属于本次 `onReplyStart` 改造的主要路径，但需要在升级说明里提醒：用户发一条新消息后 session route 会刷新。

### 是否需要版本 bump

建议 patch bump：`0.2.1 -> 0.2.2`。这是行为修复/内部机制重构，不改变公开协议。当前版本见 [plugin/package.json](/home/wutao/.openclaw/workspace-nezha/webchat3.0/plugin/package.json:2)。

## 最终建议

实现时采用“SDK `dispatcherOptions.onReplyStart` + deliver fallback 去重”的方案。

- 删除 dispatch 前即时 start，避免继续把 WebChat 圆点和 LLM 响应完全解耦。
- 在 `dispatcherOptions` 加 `onReplyStart`，让改名后的 SDK typing policy 正常生效。
- 不要额外调用 `createReplyDispatcherWithTyping`。
- 保留 deliver fallback，但用 `typingStarted` 本地去重。
