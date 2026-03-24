import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { WeChatClient } from "./client"
import { WeChatStore } from "./store"

export const WeChatPlugin: Plugin = async (input) => {
  const { client } = input

  const store = new WeChatStore()
  const wechat = new WeChatClient(store)

  const initialized = await wechat.init()
  if (!initialized) {
    console.error("[wechat] 初始化失败，插件将不可用")
    return {}
  }

  wechat.onMessage(async (prompt, senderId, contextToken) => {
    try {
      let sessionID = store.getSessionID()

      if (!sessionID) {
        console.log("[wechat] 创建微信专用会话...")
        const res = await client.session.create({ body: { title: "WeChat Bot" } })
        if (!res.data) throw new Error("创建会话失败")
        sessionID = res.data.id
        store.setSessionID(sessionID)
        console.log(`[wechat] 会话已创建: ${sessionID}`)
      }

      await client.session.promptAsync({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text: prompt }] },
      })

      console.log(`[wechat] 消息已注入到会话 ${sessionID}`)
    } catch (err) {
      console.error(`[wechat] 注入消息失败:`, err)
    }
  })

  wechat.startPolling()

  return {
    tool: {
      wechat_reply: tool({
        description: "发送微信消息回复（纯文本，无markdown，无emoji除非用户要求）",
        args: {
          sender_id: tool.schema
            .string()
            .describe("发送者ID (xxx@im.wechat格式)。群聊使用 group_id，私聊使用 sender_id"),
          text: tool.schema.string().describe("回复内容（纯文本，无markdown）"),
        },
        async execute(args) {
          try {
            const result = await wechat.sendText(args.sender_id, args.text)
            return result
          } catch (err) {
            return `发送失败: ${err instanceof Error ? err.message : String(err)}`
          }
        },
      }),

      wechat_send_image: tool({
        description: "发送微信图片",
        args: {
          sender_id: tool.schema.string().describe("发送者ID，同 wechat_reply"),
          file_path: tool.schema.string().describe("图片文件的绝对路径 (PNG, JPG等)"),
        },
        async execute(args) {
          try {
            const result = await wechat.sendImage(args.sender_id, args.file_path)
            return result
          } catch (err) {
            return `发送失败: ${err instanceof Error ? err.message : String(err)}`
          }
        },
      }),

      wechat_new_session: tool({
        description: "创建新的微信专用会话（用于清除对话历史）",
        args: {},
        async execute() {
          store.clearSessionID()
          const res = await client.session.create({ body: { title: "WeChat Bot" } })
          if (!res.data) throw new Error("创建会话失败")
          store.setSessionID(res.data.id)
          return `已创建新会话: ${res.data.id}`
        },
      }),
    },
  }
}

export default WeChatPlugin
