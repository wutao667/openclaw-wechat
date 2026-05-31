import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setWebChatRuntime, getRuntime: getWebChatRuntime } =
  createPluginRuntimeStore("WebChat runtime not initialized");

export { setWebChatRuntime, getWebChatRuntime };
