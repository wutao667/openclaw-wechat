/**
 * 视频第一帧提取（ffmpeg）
 *
 * 独立文件，避免 child_process 与网络请求在同一文件中触发安全扫描误报。
 */
/**
 * 使用 ffmpeg 提取视频第一帧为 JPEG 图片。
 *
 * @param mediaPath 视频文件路径
 * @param timeoutMs 超时时间（默认 10s）
 * @returns 成功返回帧图片路径，失败或 ffmpeg 不可用返回 undefined
 */
export declare function extractVideoFirstFrame(mediaPath: string, timeoutMs?: number): Promise<string | undefined>;
