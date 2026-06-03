# 任务：调研改名后 typing_start 触发机制重构

## 背景

主人已经验证：WebChat 渠道改名 `webchat` → `openclaw-webchat` 后，浏览器**发消息立即看到圆点**。

但**当前 plugin 代码**用的是**老 workaround**（`dispatchIncoming` line 144 手动 `sendTypingEvent`）——**没**用 SDK 的 `dispatcherOptions.onReplyStart` 钩子。

```js
// plugin/src/ws-client.js line 142-144
// 绕开 SDK 的 internal_webchat 抑制策略：在本地直接发 typing_start。
// SDK 对 OriginatingChannel === "webchat" 强制 suppressTyping，导致
// dispatcherOptions.onReplyStart 永远不会被调用。
sendTypingEvent({ kind: "start", account, userId });
```

## 当前现象

- WebChat 圆点**瞬间**出现（跟 LLM 响应**解耦**）
- 飞书/企业微信圆点**等几秒**才出现（等 LLM 第一个 byte）

## 改名的初衷

`CHANNEL_ID` 从 `webchat` 改成 `openclaw-webchat` 是为了**让 SDK 不再硬编码抑制 `onReplyStart`**。但 plugin 代码**没**跟上——**还在用 workaround**。

## 你的任务（**只调研，不改代码**）

写一份调研报告到 `codex-task-typing-refactor-output.md`，回答：

### Q1：改名后 SDK 的 `onReplyStart` 钩子现在能用了吗？

调研 SDK 内部：
- `typing-policy-BppcTc5B.js` 在 `originatingChannel === "openclaw-webchat"` 时的行为（**应该**不命中 hardcoded `webchat` 分支）
- `dispatch-BlnsVH60.js` / `get-reply-CIWAdSad.js` / `reply-dispatcher-6gyHEDyH.js` / `typing-mode-CZtCIKnv.js` 在改名后的路径
- `createReplyDispatcherWithTyping` 怎么提取/传递 `onReplyStart`
- `dispatchReplyWithBufferedBlockDispatcher` 怎么调用用户钩子

具体回答：
- `dispatcherOptions.onReplyStart` 在 `dispatchReplyWithBufferedBlockDispatcher` 调用时**会不会**被传递给 typing controller
- 改名后是**第一 byte 触发**还是**dispatch 启动时触发**还是**其他时机**
- 重复触发的可能性（如果多个钩子同时存在）

### Q2：飞书/企业微信是哪种模式？

调研 bundled Feishu/WeCom channel plugin 的 `onReplyStart` 模式：
- 用 `createReplyDispatcherWithTyping` 还是直接 `dispatcherOptions`
- typing 在 LLM 第一 byte 出现还是延迟
- 参考实现（`reference/` 里如果有）或者 grep SDK 里的内置渠道

### Q3：plugin 端需要怎么改？

给出**具体 diff 建议**（**不应用**！只描述）：

- 移除哪几行的手动 `sendTypingEvent({ kind: "start" })`
- 在 `dispatcherOptions` 里加 `onReplyStart` 钩子的代码
- 保留/移除 deliver fallback 的 `sendTypingEvent`
- 是否需要调用 `createReplyDispatcherWithTyping` 来包装（**这是关键问题**——如果 SDK 只在用 `createReplyDispatcherWithTyping` 时才提取 `onReplyStart`，那直接传 `dispatcherOptions.onReplyStart` **没用**）
- 如果必须用 `createReplyDispatcherWithTyping`，plugin 代码怎么改

### Q4：风险评估

- SDK 钩子和我们手动发送**同时存在**时会不会双触发
- 钩子**不触发**的 fallback 路径是什么
- 兼容老 user / 老 session 吗
- 是否需要版本 bump（0.2.1 → 0.2.2 patch）

## ⚠️ 严格约束

- **不要改任何代码**！只调研
- **不要 npm publish / commit / 碰云主机**
- **只 grep SDK 源码和参考实现**

## 输出

markdown 报告，含**文件:行号**引用。
