/**
 * Webhook 入站媒体处理
 *
 * 从 @mocrane/wecom media.ts 部分迁移（仅入站解密）。
 * 负责：AES-CBC 解密企微加密媒体文件、MIME 类型检测。
 */
import { type WecomHttpOptions } from "./http.js";
/** 企微使用 32 字节 PKCS#7 块大小（不是 AES 的 16 字节块） */
export declare const WECOM_PKCS7_BLOCK_SIZE = 32;
/** 解密后的媒体文件及源信息（对齐原版 DecryptedWecomMedia） */
export type DecryptedWecomMedia = {
    buffer: Buffer;
    /** HTTP Content-Type（归一化后） */
    sourceContentType?: string;
    /** 从 Content-Disposition 提取的文件名 */
    sourceFilename?: string;
    /** 最终请求 URL（跟随重定向后） */
    sourceUrl?: string;
};
/**
 * **decryptWecomMediaWithMeta (解密企业微信媒体并返回源信息)**
 *
 * 在返回解密结果的同时，保留下载响应中的元信息（content-type / filename / final url），
 * 供上层更准确地推断文件后缀和 MIME。
 */
export declare function decryptWecomMediaWithMeta(url: string, encodingAESKey: string, params?: {
    maxBytes?: number;
    http?: WecomHttpOptions;
}): Promise<DecryptedWecomMedia>;
