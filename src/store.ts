import fs from "node:fs"
import path from "node:path"
import type { AccountData } from "./types"

export class WeChatStore {
  private dir: string
  private ctxTokens: Map<string, string> = new Map()

  constructor() {
    this.dir = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".opencode", "wechat")
    fs.mkdirSync(this.dir, { recursive: true })
    this.loadContextTokens()
  }

  loadCredentials(): AccountData | null {
    try {
      const file = path.join(this.dir, "account.json")
      if (!fs.existsSync(file)) return null
      return JSON.parse(fs.readFileSync(file, "utf-8")) as AccountData
    } catch {
      return null
    }
  }

  saveCredentials(data: AccountData): void {
    const file = path.join(this.dir, "account.json")
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8")
    try {
      fs.chmodSync(file, 0o600)
    } catch {}
  }

  getSessionID(): string | null {
    try {
      const file = path.join(this.dir, "session.json")
      if (!fs.existsSync(file)) return null
      const data = JSON.parse(fs.readFileSync(file, "utf-8"))
      return data.sessionID ?? null
    } catch {
      return null
    }
  }

  setSessionID(id: string): void {
    const file = path.join(this.dir, "session.json")
    fs.writeFileSync(file, JSON.stringify({ sessionID: id }, null, 2), "utf-8")
  }

  clearSessionID(): void {
    const file = path.join(this.dir, "session.json")
    try {
      fs.unlinkSync(file)
    } catch {}
  }

  cacheContext(senderId: string, token: string): void {
    const key = senderId
    this.ctxTokens.set(key, token)
    this.persistContextTokens()
  }

  getContext(senderId: string): string | null {
    return this.ctxTokens.get(senderId) ?? null
  }

  private loadContextTokens(): void {
    try {
      const file = path.join(this.dir, "context.json")
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"))
        this.ctxTokens = new Map(Object.entries(data))
      }
    } catch {}
  }

  private persistContextTokens(): void {
    const file = path.join(this.dir, "context.json")
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this.ctxTokens), null, 2), "utf-8")
  }

  get getUpdatesBuf(): string {
    try {
      const file = path.join(this.dir, "sync_buf.txt")
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, "utf-8")
      }
    } catch {}
    return ""
  }

  set getUpdatesBuf(buf: string) {
    try {
      const file = path.join(this.dir, "sync_buf.txt")
      fs.writeFileSync(file, buf, "utf-8")
    } catch {}
  }
}
