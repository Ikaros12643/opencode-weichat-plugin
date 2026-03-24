export type AccountData = {
  token: string
  baseUrl: string
  accountId: string
  userId?: string
  savedAt: string
}

export type WeChatMessage = {
  from_user_id?: string
  to_user_id?: string
  session_id?: string
  group_id?: string
  message_type?: number
  message_state?: number
  item_list?: MessageItem[]
  context_token?: string
  create_time_ms?: number
}

export type MessageItem = {
  type?: number
  text_item?: { text?: string }
  image_item?: {
    aes_key?: string
    cdn_url?: string
    width?: number
    height?: number
    media_id?: string
  }
  voice_item?: {
    text?: string
    aes_key?: string
    cdn_url?: string
    duration_ms?: number
  }
  file_item?: {
    file_name?: string
    file_size?: number
    aes_key?: string
    cdn_url?: string
    media_id?: string
  }
  video_item?: {
    aes_key?: string
    cdn_url?: string
    duration_ms?: number
    thumb_cdn_url?: string
    media_id?: string
  }
  ref_msg?: {
    message_item?: MessageItem
    title?: string
  }
}

export type ParsedMessage = {
  senderId: string
  senderName: string
  content: string
  type: "text" | "voice" | "image" | "file" | "video" | "unknown"
  contextToken: string | null
  isGroup: boolean
  groupId?: string
}

export type GetUpdatesResponse = {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeChatMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

export const MSG_TYPE_USER = 1
export const MSG_TYPE_BOT = 2
export const MSG_STATE_FINISH = 2

export const MSG_ITEM_TEXT = 1
export const MSG_ITEM_IMAGE = 2
export const MSG_ITEM_VOICE = 3
export const MSG_ITEM_FILE = 4
export const MSG_ITEM_VIDEO = 5
