# OpenCode WeChat Plugin

> 注：因我未部署openclaw，因此连接微信的代码实现是让AI参考https://github.com/Johnixr/claude-code-wechat-channel这位大佬的仓库
>

将微信消息桥接到 OpenCode 会话的插件，基于微信官方 ClawBot ilink API。

## 功能

- 接收微信消息并自动注入到 OpenCode 会话
- AI 自动回复微信消息
- 支持文本和图片回复
- 支持私聊和群聊

## 前置要求

- [OpenCode](https://opencode.ai) >= 1.0.0
- 微信 iOS 最新版（需支持 ClawBot 插件）
- Node.js >= 18 或 Bun >= 1.0

## 安装

### 方式一：本地插件（开发模式）

1. 在项目中构建插件：

```bash
cd opencode-wechat
bun install
bun run build
```

2. 在项目根目录的 `opencode.json` 中添加插件配置：
2. plugin需要指定到构建出的dist目录下的index.js

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file://./opencode-wechat/dist/index.js"]
}
```

### 方式二：发布到 npm 后安装

1. 发布插件：

```bash
cd opencode-wechat
bun run build
npm publish
```

2. 在任意项目的 `opencode.json` 中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wechat"]
}
```

## 使用方法

### 1. 启动 OpenCode

```bash
opencode
```

首次使用时，插件会显示微信登录二维码：

```
[wechat] 正在获取微信登录二维码...

扫码链接（可复制到浏览器）:
https://...

请使用微信扫描以下二维码：

█████████████████████
█ ▄▄▄▄▄ █▀▄█▄█ ▄▄▄▄▄ █
█ █   █ █▀▀▀█  █   █ █
...
█████████████████████

[wechat] 等待扫码...
```

用微信扫描二维码并确认登录。

### 2. 开始使用

登录成功后，插件会：

1. 自动创建一个名为 "WeChat Bot" 的专用会话
2. 开始监听微信消息
3. 收到消息时自动注入到会话中

在微信中发送消息后，OpenCode 会自动处理并回复。

### 3. 可用工具

插件提供以下工具供 AI 使用：

#### `wechat_reply`

发送文本回复。

参数：

- `sender_id`: 发送者ID（从消息中获取）
- `text`: 回复内容（纯文本，无markdown）

#### `wechat_send_image`

发送图片。

参数：

- `sender_id`: 发送者ID
- `file_path`: 图片文件的绝对路径

#### `wechat_new_session`

创建新的微信专用会话，清除对话历史。

## 消息格式

微信消息会以以下格式注入到会话：

```
<wechat_message>
来源: 微信
发送者: 张三
发送者ID: zhangsan@im.wechat
消息类型: text
可回复: 是
---
你好，请问有什么可以帮助我的？

请使用 wechat_reply 或 wechat_send_image 工具回复此消息。
</wechat_message>
```

## 群聊支持

在群聊中：

- `sender_id` 应使用 `group_id`（用于回复整个群）
- 原始发送者的 ID 会保存在上下文中

## 数据存储

插件数据存储在 `~/.opencode/wechat/` 目录：

```
~/.opencode/wechat/
├── account.json     # 微信登录凭据
├── session.json     # OpenCode 会话ID
├── context.json     # 上下文token缓存
└── sync_buf.txt     # 同步状态
```

## 注意事项

1. **单用户模式**: 当前版本为单用户模式，所有微信消息路由到一个 OpenCode 会话
2. **微信版本**: 需要微信 iOS 最新版，支持 ClawBot 插件
3. **上下文token**: 如果消息缺少上下文token，无法直接回复。需要用户发送新消息建立会话
4. **回复格式**: 微信只支持纯文本，不要使用 markdown 格式

## 开发

```bash
# 安装依赖
bun install

# 构建
bun run build

# 监听模式
bun run dev
```

## License

MIT
