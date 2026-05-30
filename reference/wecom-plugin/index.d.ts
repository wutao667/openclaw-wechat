import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: Record<string, unknown>;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
