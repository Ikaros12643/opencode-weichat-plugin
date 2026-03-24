import type { WeChatMessage, ParsedMessage, MessageItem } from "./types"
import { MSG_ITEM_TEXT, MSG_ITEM_IMAGE, MSG_ITEM_VOICE, MSG_ITEM_FILE, MSG_ITEM_VIDEO } from "./types"

export function parseMessage(msg: WeChatMessage): ParsedMessage | null {
  const content = extractContent(msg)
  if (!content) return null

  const senderId = msg.from_user_id ?? "unknown"
  const senderName = senderId.split("@")[0] ?? senderId
  const isGroup = Boolean(msg.group_id)

  return {
    senderId,
    senderName,
    content: content.text,
    type: content.msgType,
    contextToken: msg.context_token ?? null,
    isGroup,
    groupId: msg.group_id,
  }
}

function extractContent(msg: WeChatMessage): { text: string; msgType: ParsedMessage["type"] } | null {
  if (!msg.item_list?.length) return null

  for (const item of msg.item_list) {
    const result = extractItemContent(item)
    if (result) return result
  }
  return null
}

function extractItemContent(item: MessageItem): { text: string; msgType: ParsedMessage["type"] } | null {
  switch (item.type) {
    case MSG_ITEM_TEXT: {
      if (!item.text_item?.text) return null
      let text = item.text_item.text
      if (item.ref_msg?.title) {
        text = `[引用: ${item.ref_msg.title}]\n${text}`
      }
      return { text, msgType: "text" }
    }

    case MSG_ITEM_VOICE: {
      const transcript = item.voice_item?.text
      if (transcript) {
        return { text: `[语音转文字] ${transcript}`, msgType: "voice" }
      }
      return { text: "[语音消息（无文字转录）]", msgType: "voice" }
    }

    case MSG_ITEM_IMAGE: {
      const img = item.image_item
      const dims = img?.width && img?.height ? ` (${img.width}x${img.height})` : ""
      return { text: `[图片${dims}]`, msgType: "image" }
    }

    case MSG_ITEM_FILE: {
      const f = item.file_item
      const name = f?.file_name ? ` "${f.file_name}"` : ""
      const size = f?.file_size ? ` (${(f.file_size / 1024).toFixed(1)} KB)` : ""
      return { text: `[文件${name}${size}]`, msgType: "file" }
    }

    case MSG_ITEM_VIDEO: {
      const v = item.video_item
      const dur = v?.duration_ms ? ` (${(v.duration_ms / 1000).toFixed(1)}s)` : ""
      return { text: `[视频${dur}]`, msgType: "video" }
    }

    default:
      return { text: `[未知消息类型 ${item.type}]`, msgType: "unknown" }
  }
}

export function formatForAI(msg: ParsedMessage): string {
  const lines = [`来源: 微信`, `发送者: ${msg.senderName}`, `发送者ID: ${msg.senderId}`]

  if (msg.isGroup && msg.groupId) {
    lines.push(`群聊ID: ${msg.groupId}`)
  }

  lines.push(`消息类型: ${msg.type}`)
  lines.push(`可回复: ${msg.contextToken ? "是" : "否"}`)

  return `<wechat_message>
${lines.join("\n")}
---
${msg.content}

${
  msg.contextToken
    ? "请使用 wechat_reply 或 wechat_send_image 工具回复此消息。"
    : "注意: 此消息缺少上下文token，无法直接回复。请告诉用户发送下一条消息以建立会话。"
}
</wechat_message>`
}
