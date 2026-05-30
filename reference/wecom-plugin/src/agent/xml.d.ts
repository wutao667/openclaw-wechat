/**
 * WeCom XML 加解密辅助函数
 * 用于 Agent 模式处理 XML 格式回调
 */
/**
 * 从 XML 密文中提取 Encrypt 字段
 */
export declare function extractEncryptFromXml(xml: string): string;
/**
 * 从 XML 中提取 ToUserName (CorpID)
 */
export declare function extractToUserNameFromXml(xml: string): string;
/**
 * 构建加密 XML 响应
 */
export declare function buildEncryptedXmlResponse(params: {
    encrypt: string;
    signature: string;
    timestamp: string;
    nonce: string;
}): string;
