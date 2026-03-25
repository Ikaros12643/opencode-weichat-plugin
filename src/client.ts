import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import type { AccountData, WeChatMessage, GetUpdatesResponse } from "./types"

interface UploadUrlResponse {
  upload_url?: string
  media_id?: string
  ret?: number
  errmsg?: string
}
import { WeChatStore } from "./store"
import { parseMessage, formatForAI } from "./message"
import { MSG_TYPE_USER, MSG_TYPE_BOT, MSG_STATE_FINISH, MSG_ITEM_TEXT, MSG_ITEM_IMAGE } from "./types"

const ILINK_BASE = "https://ilinkai.weixin.qq.com"
const BOT_TYPE = "3"
const LONG_POLL_TIMEOUT_MS = 35_000

export class WeChatClient {
  private account: AccountData | null = null
  private polling = false
  private onMessageCallback: ((prompt: string, senderId: string, contextToken: string | null) => Promise<void>) | null =
    null

  constructor(private store: WeChatStore) {}

  async init(): Promise<boolean> {
    this.account = this.store.loadCredentials()
    if (!this.account) {
      this.account = await this.qrLogin()
      if (!this.account) return false
    }
    console.log(`[wechat] 使用已保存账号: ${this.account.accountId}`)
    return true
  }

  onMessage(callback: (prompt: string, senderId: string, contextToken: string | null) => Promise<void>): void {
    this.onMessageCallback = callback
  }

  startPolling(): void {
    if (this.polling) return
    this.polling = true
    this.pollLoop()
  }

  stopPolling(): void {
    this.polling = false
  }

  async sendText(to: string, text: string): Promise<string> {
    if (!this.account) throw new Error("未登录微信")

    const contextToken = this.store.getContext(to)
    if (!contextToken) {
      throw new Error(`无上下文token，无法回复 ${to}。请让用户发送新消息。`)
    }

    await this.apiCall("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: this.generateClientId(),
        message_type: MSG_TYPE_BOT,
        message_state: MSG_STATE_FINISH,
        item_list: [{ type: MSG_ITEM_TEXT, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: { channel_version: "1.0.0" },
    })

    return "消息已发送"
  }

  async sendImage(to: string, filePath: string): Promise<string> {
    if (!this.account) throw new Error("未登录微信")

    const contextToken = this.store.getContext(to)
    if (!contextToken) {
      throw new Error(`无上下文token，无法回复 ${to}`)
    }

    const imageBuffer = fs.readFileSync(filePath)
    const aesKey = crypto.randomBytes(16)
    const encrypted = this.encryptAesEcb(imageBuffer, aesKey)

    const uploadResp = (await this.apiCall("ilink/bot/getuploadurl", {
      to_user_id: to,
      context_token: contextToken,
      media_type: MSG_ITEM_IMAGE,
      content_length: encrypted.length,
      base_info: { channel_version: "1.0.0" },
    })) as UploadUrlResponse

    if (!uploadResp.upload_url || !uploadResp.media_id) {
      throw new Error(`获取上传URL失败: ${JSON.stringify(uploadResp)}`)
    }

    await fetch(uploadResp.upload_url, {
      method: "PUT",
      body: new Uint8Array(encrypted),
      headers: { "Content-Length": String(encrypted.length) },
      signal: AbortSignal.timeout(60_000),
    })

    await this.apiCall("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: this.generateClientId(),
        message_type: MSG_TYPE_BOT,
        message_state: MSG_STATE_FINISH,
        item_list: [
          {
            type: MSG_ITEM_IMAGE,
            image_item: {
              media_id: uploadResp.media_id,
              aes_key: aesKey.toString("base64"),
            },
          },
        ],
        context_token: contextToken,
      },
      base_info: { channel_version: "1.0.0" },
    })

    return "图片已发送"
  }

  private async pollLoop(): Promise<void> {
    let buf = this.store.getUpdatesBuf
    console.log("[wechat] 开始监听微信消息...")

    while (this.polling) {
      try {
        const resp = await this.getUpdates(buf)

        if (resp.ret !== undefined && resp.ret !== 0) {
          console.error(`[wechat] getUpdates 错误: ret=${resp.ret} errmsg=${resp.errmsg ?? ""}`)
          await this.sleep(5000)
          continue
        }

        if (resp.get_updates_buf) {
          buf = resp.get_updates_buf
          this.store.getUpdatesBuf = buf
        }

        for (const msg of resp.msgs ?? []) {
          if (msg.message_type !== MSG_TYPE_USER) continue

          const parsed = parseMessage(msg)
          if (!parsed) continue

          const contextKey = parsed.isGroup ? parsed.groupId! : parsed.senderId
          if (parsed.contextToken) {
            this.store.cacheContext(contextKey, parsed.contextToken)
            if (parsed.isGroup) {
              this.store.cacheContext(parsed.senderId, parsed.contextToken)
            }
          }

          const senderShort = parsed.senderName
          console.log(
            `[wechat] 收到${parsed.isGroup ? "群" : "私"}消息 [${parsed.type}]: ` +
              `from=${senderShort} ` +
              `"${parsed.content.slice(0, 60)}"`,
          )

          if (this.onMessageCallback) {
            const prompt = formatForAI(parsed)
            await this.onMessageCallback(prompt, contextKey, parsed.contextToken)
          }
        }
      } catch (err) {
        console.error(`[wechat] 轮询异常: ${err}`)
        await this.sleep(3000)
      }
    }
  }

  private async getUpdates(buf: string): Promise<GetUpdatesResponse> {
    try {
      const raw = await this.apiCall(
        "ilink/bot/getupdates",
        {
          get_updates_buf: buf,
          base_info: { channel_version: "1.0.0" },
        },
        LONG_POLL_TIMEOUT_MS,
      )
      return raw as GetUpdatesResponse
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ret: 0, msgs: [], get_updates_buf: buf }
      }
      throw err
    }
  }

  private async qrLogin(): Promise<AccountData | null> {
    console.log("[wechat] 正在获取微信登录二维码...")

    const qrResp = (await fetch(`${ILINK_BASE}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`).then(
      (r) => r.json(),
    )) as { qrcode: string; qrcode_img_content: string }

    console.log("\n扫码链接（可复制到浏览器）:")
    console.log(qrResp.qrcode_img_content + "\n")
    console.log("请使用微信扫描以下二维码：\n")

    try {
      const qrterm = await import("qrcode-terminal")
      await new Promise<void>((resolve) => {
        qrterm.default.generate(qrResp.qrcode_img_content, { small: true }, (qr: string) => {
          console.log(qr + "\n")
          resolve()
        })
      })
    } catch {
      console.log("[wechat] qrcode-terminal 不可用，请使用上方链接扫码")
    }

    console.log("[wechat] 等待扫码...")
    const deadline = Date.now() + 480_000
    let scannedPrinted = false

    while (Date.now() < deadline) {
      const status = (await fetch(
        `${ILINK_BASE}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrResp.qrcode)}`,
      ).then((r) => r.json())) as {
        status: "wait" | "scaned" | "confirmed" | "expired"
        bot_token?: string
        ilink_bot_id?: string
        baseurl?: string
        ilink_user_id?: string
      }

      switch (status.status) {
        case "wait":
          break
        case "scaned":
          if (!scannedPrinted) {
            console.log("[wechat] 已扫码，请在微信中确认...")
            scannedPrinted = true
          }
          break
        case "expired":
          console.log("[wechat] 二维码已过期，请重新启动。")
          return null
        case "confirmed": {
          if (!status.ilink_bot_id || !status.bot_token) {
            console.error("[wechat] 登录确认但未返回 bot 信息")
            return null
          }
          const account: AccountData = {
            token: status.bot_token,
            baseUrl: status.baseurl || ILINK_BASE,
            accountId: status.ilink_bot_id,
            userId: status.ilink_user_id,
            savedAt: new Date().toISOString(),
          }
          this.store.saveCredentials(account)
          console.log("[wechat] 微信连接成功！")
          return account
        }
      }
      await this.sleep(1000)
    }

    console.log("[wechat] 登录超时")
    return null
  }

  private async apiCall(endpoint: string, body: object, timeoutMs = 15_000): Promise<object> {
    if (!this.account) throw new Error("未登录")

    const url = `${this.account.baseUrl}/${endpoint}`
    const bodyStr = JSON.stringify(body)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          AuthorizationType: "ilink_bot_token",
          Authorization: `Bearer ${this.account.token}`,
          "X-WECHAT-UIN": this.randomWechatUin(),
          "Content-Length": String(Buffer.byteLength(bodyStr, "utf-8")),
        },
        body: bodyStr,
        signal: controller.signal,
      })
      clearTimeout(timer)

      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
      return JSON.parse(text)
    } catch (err) {
      clearTimeout(timer)
      throw err
    }
  }

  private generateClientId(): string {
    return `opencode-wechat:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
  }

  private randomWechatUin(): string {
    const uint32 = crypto.randomBytes(4).readUInt32BE(0)
    return Buffer.from(String(uint32), "utf-8").toString("base64")
  }

  private encryptAesEcb(data: Buffer, key: Buffer): Buffer {
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null)
    cipher.setAutoPadding(true)
    return Buffer.concat([cipher.update(data), cipher.final()])
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
