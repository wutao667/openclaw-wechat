import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
const { setRuntime: setWeComRuntime, getRuntime: getWeComRuntime } = createPluginRuntimeStore("WeCom runtime not initialized");
export { setWeComRuntime, getWeComRuntime };
