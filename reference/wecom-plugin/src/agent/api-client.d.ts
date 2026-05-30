/**
 * WeCom Agent API 客户端
 * 管理 AccessToken 缓存和 API 调用
 */
import type { ResolvedAgentAccount } from "../types/index.js";
/**
 * **getAccessToken (获取 AccessToken)**
 *
 * 获取企业微信 API 调用所需的 AccessToken。
 * 具备自动缓存和过期刷新机制。
 *
 * @param agent Agent 账号信息
 * @returns 有效的 AccessToken
 */
export declare function getAccessToken(agent: ResolvedAgentAccount): Promise<string>;
/**
 * **sendText (发送文本消息)**
 *
 * 调用 `message/send` (Agent) 或 `appchat/send` (群聊) 发送文本。
 *
 * @param params.agent 发送方 Agent
 * @param params.toUser 接收用户 ID (单聊可选，可与 toParty/toTag 同时使用)
 * @param params.toParty 接收部门 ID (单聊可选)
 * @param params.toTag 接收标签 ID (单聊可选)
 * @param params.chatId 接收群 ID (群聊模式必填，互斥)
 * @param params.text 消息内容
 */
export declare function sendText(params: {
    agent: ResolvedAgentAccount;
    toUser?: string;
    toParty?: string;
    toTag?: string;
    chatId?: string;
    text: string;
}): Promise<void>;
/**
 * **uploadMedia (上传媒体文件)**
 *
 * 上传临时素材到企业微信。
 * 素材有效期为 3 天。
 *
 * @param params.type 媒体类型 (image, voice, video, file)
 * @param params.buffer 文件二进制数据
 * @param params.filename 文件名 (需包含正确扩展名)
 * @returns 媒体 ID (media_id)
 */
export declare function uploadMedia(params: {
    agent: ResolvedAgentAccount;
    type: "image" | "voice" | "video" | "file";
    buffer: Buffer;
    filename: string;
}): Promise<string>;
/**
 * **sendMedia (发送媒体消息)**
 *
 * 发送图片、音频、视频或文件。需先通过 `uploadMedia` 获取 media_id。
 *
 * @param params.agent 发送方 Agent
 * @param params.toUser 接收用户 ID (单聊可选)
 * @param params.toParty 接收部门 ID (单聊可选)
 * @param params.toTag 接收标签 ID (单聊可选)
 * @param params.chatId 接收群 ID (群聊模式必填)
 * @param params.mediaId 媒体 ID
 * @param params.mediaType 媒体类型
 * @param params.title 视频标题 (可选)
 * @param params.description 视频描述 (可选)
 */
export declare function sendMedia(params: {
    agent: ResolvedAgentAccount;
    toUser?: string;
    toParty?: string;
    toTag?: string;
    chatId?: string;
    mediaId: string;
    mediaType: "image" | "voice" | "video" | "file";
    title?: string;
    description?: string;
}): Promise<void>;
/**
 * **downloadMedia (下载媒体文件)**
 *
 * 通过 media_id 从企业微信服务器下载临时素材。
 *
 * @returns { buffer, contentType }
 */
export declare function downloadMedia(params: {
    agent: ResolvedAgentAccount;
    mediaId: string;
    maxBytes?: number;
}): Promise<{
    buffer: Buffer;
    contentType: string;
    filename?: string;
}>;
