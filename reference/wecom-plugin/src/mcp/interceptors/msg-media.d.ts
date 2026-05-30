/**
 * get_msg_media 响应拦截器
 *
 * 核心逻辑：
 * 1. beforeCall: 设置延长的超时时间（120s），因为 base64 数据可达 ~27MB
 * 2. afterCall: 从 MCP result 的 content[].text 中提取 base64_data，
 *    解码为 Buffer 并通过 saveMediaBuffer 保存到本地媒体目录，
 *    替换响应中的 base64_data 为 local_path，避免大模型被 base64 数据消耗 token
 */
import type { CallInterceptor } from "./types.js";
export declare const mediaInterceptor: CallInterceptor;
