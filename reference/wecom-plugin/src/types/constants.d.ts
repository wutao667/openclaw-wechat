/**
 * WeCom 双模式常量定义
 */
/** 固定 Webhook 路径 */
export declare const WEBHOOK_PATHS: {
    /** Bot 模式历史兼容路径（不再维护） */
    readonly BOT: "/wecom";
    /** Bot 模式历史备用兼容路径（不再维护） */
    readonly BOT_ALT: "/wecom/bot";
    /** Agent 模式历史兼容路径（不再维护） */
    readonly AGENT: "/wecom/agent";
    /** Bot 模式推荐路径前缀 */
    readonly BOT_PLUGIN: "/plugins/wecom/bot";
    /** Agent 模式推荐路径前缀 */
    readonly AGENT_PLUGIN: "/plugins/wecom/agent";
};
/** 企业微信 API 端点 */
export declare const API_ENDPOINTS: {
    readonly GET_TOKEN: "https://qyapi.weixin.qq.com/cgi-bin/gettoken";
    readonly SEND_MESSAGE: "https://qyapi.weixin.qq.com/cgi-bin/message/send";
    readonly SEND_APPCHAT: "https://qyapi.weixin.qq.com/cgi-bin/appchat/send";
    readonly UPLOAD_MEDIA: "https://qyapi.weixin.qq.com/cgi-bin/media/upload";
    readonly DOWNLOAD_MEDIA: "https://qyapi.weixin.qq.com/cgi-bin/media/get";
};
/** 各类限制常量 */
export declare const LIMITS: {
    /** 文本消息最大字节数 */
    readonly TEXT_MAX_BYTES: 2048;
    /** Token 刷新缓冲时间 (提前刷新) */
    readonly TOKEN_REFRESH_BUFFER_MS: 60000;
    /** HTTP 请求超时 */
    readonly REQUEST_TIMEOUT_MS: 15000;
    /** 最大请求体大小 */
    readonly MAX_REQUEST_BODY_SIZE: number;
};
/** AES 加密常量 */
export declare const CRYPTO: {
    /** PKCS#7 块大小 */
    readonly PKCS7_BLOCK_SIZE: 32;
    /** AES Key 长度 */
    readonly AES_KEY_LENGTH: 32;
};
