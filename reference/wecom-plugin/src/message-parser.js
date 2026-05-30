/**
 * 企业微信消息内容解析模块
 *
 * 负责从 WsFrame 中提取文本、图片、引用等内容
 */
// ============================================================================
// 解析函数
// ============================================================================
/**
 * 将模板卡片事件回调格式化为可继续路由给大模型的文本。
 *
 * 这样后续 Agent 可以直接从 question_key / option_id 中理解用户的真实选择。
 */
function buildTemplateCardEventText(body) {
    const templateCardEvent = body.event?.template_card_event;
    if (body.msgtype !== "event" ||
        body.event?.eventtype !== "template_card_event" ||
        !templateCardEvent) {
        return undefined;
    }
    const selectedItems = templateCardEvent.selected_items?.selected_item ?? [];
    const selectedLines = selectedItems.map((item) => {
        const questionKey = item.question_key?.trim() || "unknown_question";
        const optionIds = item.option_ids?.option_id?.filter(Boolean) ?? [];
        return `- ${questionKey}: ${optionIds.length > 0 ? optionIds.join(", ") : "(未选择)"}`;
    });
    const senderUserId = body.from?.userid || "";
    const senderCorpId = body.from?.corpid || "";
    const chatId = body.chatid || senderUserId;
    return [
        "[企业微信模板卡片回调]",
        `event_type(事件类型): template_card_event`,
        body.msgid ? `msgid(消息 id): ${body.msgid}` : undefined,
        body.aibotid ? `aibotid(机器人 id): ${body.aibotid}` : undefined,
        body.chattype ? `chat_type(会话类型): ${body.chattype}` : undefined,
        chatId ? `chat_id(会话 id): ${chatId}` : undefined,
        senderCorpId ? `from.corpid(企业 id): ${senderCorpId}` : undefined,
        senderUserId ? `from.userid(发送人 id): ${senderUserId}` : undefined,
        senderUserId ? `sender_userid(发送人 id): ${senderUserId}` : undefined,
        templateCardEvent.card_type ? `card_type(卡片类型): ${templateCardEvent.card_type}` : undefined,
        templateCardEvent.event_key ? `event_key(事件 key): ${templateCardEvent.event_key}` : undefined,
        templateCardEvent.task_id ? `task_id(任务 id): ${templateCardEvent.task_id}` : undefined,
        selectedLines.length > 0 ? "selected_items(选择项):" : "selected_items(选择项): []",
        ...selectedLines,
    ]
        .filter((line) => Boolean(line))
        .join("\n");
}
// ============================================================================
// 权限类型映射
// ============================================================================
/** 权限类型枚举 */
var AuthType;
(function (AuthType) {
    /** 新建和编辑文档 */
    AuthType[AuthType["CREATE_AND_EDIT_DOC"] = 1] = "CREATE_AND_EDIT_DOC";
    /** 获取成员文档内容 */
    AuthType[AuthType["GET_DOC_CONTENT"] = 2] = "GET_DOC_CONTENT";
})(AuthType || (AuthType = {}));
/** 权限类型值 → 中文描述 */
const AUTH_TYPE_MAP = {
    [AuthType.CREATE_AND_EDIT_DOC]: "新建和编辑文档",
    [AuthType.GET_DOC_CONTENT]: "获取成员文档内容",
};
/**
 * 将权限变更事件回调格式化为可继续路由给大模型的文本。
 *
 * 当管理员在授权页面变更权限后，系统收到 auth_change_event 回调，
 * 根据 auth_list 生成对应的提示文本，引导 Agent 继续操作。
 */
function buildAuthChangeEventText(body) {
    console.log("authChangeEventCheck", body.event);
    const authChangeEvent = body.event?.auth_change_event;
    if (body.msgtype !== "event" ||
        body.event?.eventtype !== "auth_change_event" ||
        !authChangeEvent) {
        return undefined;
    }
    const authList = authChangeEvent.auth_list ?? [];
    const authDescriptions = authList
        .map((code) => AUTH_TYPE_MAP[code] || `未知权限(${code})`)
        .join("、");
    // 根据权限列表内容生成不同的操作指引
    const hasDocContentAuth = authList.includes(AuthType.GET_DOC_CONTENT);
    let actionHint;
    if (hasDocContentAuth) {
        // 包含"获取成员文档内容"权限，引导 Agent 继续文档操作
        actionHint = "用户已授予文档内容读取权限，请继续之前的文档操作。";
    }
    else if (authList.length > 0) {
        // 有其他权限但没有文档内容读取权限
        actionHint = "当前授权不包含文档内容读取权限，无法继续文档操作。请引导用户授予「获取成员文档内容」权限，该权限需要向管理员申请，管理员审批通过后可使用。";
    }
    else {
        // 权限列表为空
        actionHint = "当前无任何文档权限，无法继续文档操作。请引导用户完成文档授权。";
    }
    const senderUserId = body.from?.userid || "";
    const senderCorpId = body.from?.corpid || "";
    const chatId = body.from?.chat_id || body.chatid || senderUserId;
    return [
        "[企业微信文档权限变更回调]",
        `event_type(事件类型): auth_change_event`,
        `auth_list(当前权限列表): [${authList.join(", ")}] (${authDescriptions || "无"})`,
        body.msgid ? `msgid(消息 id): ${body.msgid}` : undefined,
        body.aibotid ? `aibotid(机器人 id): ${body.aibotid}` : undefined,
        body.chattype ? `chat_type(会话类型): ${body.chattype}` : undefined,
        chatId ? `chat_id(会话 id): ${chatId}` : undefined,
        senderCorpId ? `from.corpid(企业 id): ${senderCorpId}` : undefined,
        senderUserId ? `from.userid(发送人 id): ${senderUserId}` : undefined,
        "",
        `[操作指引] ${actionHint}`,
    ]
        .filter((line) => line !== undefined)
        .join("\n");
}
/**
 * 解析消息内容（支持单条消息、图文混排、事件回调和引用消息）
 * @returns 提取的文本数组、图片URL数组和引用消息内容
 */
export function parseMessageContent(body) {
    const textParts = [];
    const imageUrls = [];
    const imageAesKeys = new Map();
    const fileUrls = [];
    const fileAesKeys = new Map();
    let quoteContent;
    if (body.msgtype === "event") {
        // 处理权限变更事件回调（如文档授权）
        const authChangeText = buildAuthChangeEventText(body);
        if (authChangeText) {
            textParts.push(authChangeText);
            return { textParts, imageUrls, imageAesKeys, fileUrls, fileAesKeys, quoteContent };
        }
        // 处理模板卡片事件回调
        const eventText = buildTemplateCardEventText(body);
        if (eventText) {
            textParts.push(eventText);
        }
        return { textParts, imageUrls, imageAesKeys, fileUrls, fileAesKeys, quoteContent };
    }
    // 处理图文混排消息
    if (body.msgtype === "mixed" && body.mixed?.msg_item) {
        for (const item of body.mixed.msg_item) {
            if (item.msgtype === "text" && item.text?.content) {
                textParts.push(item.text.content);
            }
            else if (item.msgtype === "image" && item.image?.url) {
                imageUrls.push(item.image.url);
                if (item.image.aeskey) {
                    imageAesKeys.set(item.image.url, item.image.aeskey);
                }
            }
        }
    }
    else {
        // 处理单条消息
        if (body.text?.content) {
            textParts.push(body.text.content);
        }
        // 处理语音消息（语音转文字后的文本内容）
        if (body.msgtype === "voice" && body.voice?.content) {
            textParts.push(body.voice.content);
        }
        if (body.image?.url) {
            imageUrls.push(body.image.url);
            if (body.image.aeskey) {
                imageAesKeys.set(body.image.url, body.image.aeskey);
            }
        }
        // 处理文件消息
        if (body.msgtype === "file" && body.file?.url) {
            fileUrls.push(body.file.url);
            if (body.file.aeskey) {
                fileAesKeys.set(body.file.url, body.file.aeskey);
            }
        }
        // 处理视频消息（沿用 file 下载/解密通路，作为文件附件透传）
        if (body.msgtype === "video" && body.video?.url) {
            fileUrls.push(body.video.url);
            if (body.video.aeskey) {
                fileAesKeys.set(body.video.url, body.video.aeskey);
            }
        }
    }
    // 处理引用消息
    if (body.quote) {
        if (body.quote.msgtype === "text" && body.quote.text?.content) {
            quoteContent = body.quote.text.content;
        }
        else if (body.quote.msgtype === "voice" && body.quote.voice?.content) {
            quoteContent = body.quote.voice.content;
        }
        else if (body.quote.msgtype === "image" && body.quote.image?.url) {
            // 引用的图片消息：将图片 URL 加入下载列表
            imageUrls.push(body.quote.image.url);
            if (body.quote.image.aeskey) {
                imageAesKeys.set(body.quote.image.url, body.quote.image.aeskey);
            }
        }
        else if (body.quote.msgtype === "file" && body.quote.file?.url) {
            // 引用的文件消息：将文件 URL 加入下载列表
            fileUrls.push(body.quote.file.url);
            if (body.quote.file.aeskey) {
                fileAesKeys.set(body.quote.file.url, body.quote.file.aeskey);
            }
        }
        else if (body.quote.msgtype === "video" && body.quote.video?.url) {
            // 引用的视频消息：沿用文件下载通路
            fileUrls.push(body.quote.video.url);
            if (body.quote.video.aeskey) {
                fileAesKeys.set(body.quote.video.url, body.quote.video.aeskey);
            }
        }
    }
    return { textParts, imageUrls, imageAesKeys, fileUrls, fileAesKeys, quoteContent };
}
