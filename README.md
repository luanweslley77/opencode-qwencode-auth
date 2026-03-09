# 🤖 Qwen Code OAuth Plugin for OpenCode

![npm version](https://img.shields.io/npm/v/opencode-qwencode-auth)
![License](https://img.shields.io/github/license/gustavodiasdev/opencode-qwencode-auth)
![GitHub stars](https://img.shields.io/github/stars/gustavodiasdev/opencode-qwencode-auth)

<p align="center">
  <img src="assets/screenshot.png" alt="OpenCode with Qwen Code" width="800">
</p>

**Authenticate OpenCode CLI with your qwen.ai account.** This plugin enables you to use Qwen models (Coder, Max, Plus and more) with **2,000 free requests per day** - no API key or credit card required!

[🇧🇷 Leia em Português](./README.pt-BR.md)

## ✨ Features

- 🚀 **Qwen 3.5 Plus Support** - Use the latest flagship hybrid model
- 🔐 **OAuth Device Flow** - Secure browser-based authentication (RFC 8628)
- ⚡ **Automatic Polling** - No need to press Enter after authorizing
- 🆓 **2,000 req/day free** - Generous free tier with no credit card
- 🧠 **1M context window** - Models with 1 million token context
- 🔄 **Auto-refresh** - Tokens renewed automatically before expiration
- 🔗 **qwen-code compatible** - Reuses credentials from `~/.qwen/oauth_creds.json`
- 🌐 **Dynamic Routing** - Automatic resolution of API base URL based on region
- 🏎️ **KV Cache Support** - Official DashScope headers for high performance
- 🎯 **Rate Limit Fix** - Official headers prevent aggressive rate limiting (Fixes #4)
- 🔍 **Session Tracking** - Unique session/prompt IDs for proper quota recognition

## 🆕 What's New in v1.5.0

### Rate Limiting Fix (Issue #4)

**Problem:** Users were experiencing aggressive rate limiting (2,000 req/day quota exhausted quickly).

**Solution:** Added official Qwen Code headers that properly identify the client:
- `X-DashScope-CacheControl: enable` - Enables KV cache optimization
- `X-DashScope-AuthType: qwen-oauth` - Marks as OAuth authentication
- `X-DashScope-UserAgent` - Identifies as official Qwen Code client
- `X-Metadata` - Session and prompt tracking for quota recognition

**Result:** Full daily quota now available without premature rate limiting.

### Dynamic API Endpoint Resolution

The plugin now automatically detects and uses the correct API endpoint based on the `resource_url` returned by the OAuth server:

| resource_url | API Endpoint | Region |
|-------------|--------------|--------|
| `portal.qwen.ai` | `https://portal.qwen.ai/v1` | International |
| `dashscope` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | China |
| `dashscope-intl` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | International |

This means the plugin works correctly regardless of which region your Qwen account is associated with.

### Latest Model Support

- ✅ **qwen3.5-plus** - Latest flagship hybrid model with reasoning + vision
- ✅ **Vision capabilities** - Models with vision now correctly support image input
- ✅ **Dynamic modalities** - Input modalities adapt based on model capabilities

## 📋 Prerequisites

- [OpenCode CLI](https://opencode.ai) installed
- A [qwen.ai](https://chat.qwen.ai) account (free to create)

## 🚀 Installation

### 1. Install the plugin

```bash
cd ~/.config/opencode && npm install opencode-qwencode-auth
```

### 2. Enable the plugin

Edit `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugin": ["opencode-qwencode-auth"]
}
```

## 🔑 Usage

### 1. Login

```bash
opencode auth login
```

### 2. Select Provider

Choose **"Other"** and type `qwen-code`

### 3. Authenticate

Select **"Qwen Code (qwen.ai OAuth)"**

- A browser window will open for you to authorize
- The plugin automatically detects when you complete authorization
- No need to copy/paste codes or press Enter!

> [!TIP]
> In the OpenCode TUI (graphical interface), the **Qwen Code** provider appears automatically in the provider list.

## 🎯 Available Models

### Coding Models

| Model | Context | Max Output | Features |
|-------|---------|------------|----------|
| `qwen3.5-plus` | 1M tokens | 64K tokens | Latest Flagship, Hybrid, Vision, Reasoning |
| `qwen3-coder-plus` | 1M tokens | 64K tokens | Stable Qwen 3.0 Coding model |
| `qwen3-coder-flash` | 1M tokens | 64K tokens | Fast coding responses |
| `coder-model` | 1M tokens | 64K tokens | Official alias (Auto-routes to Qwen 3.5 Plus) |

### General Purpose Models

| Model | Context | Max Output | Reasoning | Best For |
|-------|---------|------------|-----------|----------|
| `qwen3-max` | 256K tokens | 64K tokens | No | Flagship model, complex reasoning and tool use |
| `vision-model` | 128K tokens | 32K tokens | No | Official Vision alias (Qwen VL Plus) |
| `qwen-plus-latest` | 128K tokens | 16K tokens | Yes | Balanced quality-speed with thinking mode |
| `qwen-flash` | 1M tokens | 8K tokens | No | Ultra-fast, low-cost simple tasks |

### Using a specific model

```bash
opencode --provider qwen-code --model qwen3.5-plus
opencode --provider qwen-code --model qwen3-coder-plus
opencode --provider qwen-code --model coder-model
```

## ⚙️ How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OpenCode CLI  │────▶│  qwen.ai OAuth   │────▶│  Qwen Models    │
│                 │◀────│  (Device Flow)   │◀────│  API            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Device Flow (RFC 8628)**: Opens your browser to `chat.qwen.ai` for authentication
2. **Automatic Polling**: Detects authorization completion automatically
3. **Token Storage**: Saves credentials to `~/.qwen/oauth_creds.json`
4. **Auto-refresh**: Renews tokens 30 seconds before expiration

## 📊 Usage Limits

| Plan | Rate Limit | Daily Limit |
|------|------------|-------------|
| Free (OAuth) | 60 req/min | 2,000 req/day |

> [!NOTE]
> Limits reset at midnight UTC. For higher limits, consider using an API key from [DashScope](https://dashscope.aliyun.com).

## 🔧 Troubleshooting

### Token expired

The plugin automatically renews tokens. If issues persist:

```bash
# Remove old credentials
rm ~/.qwen/oauth_creds.json

# Re-authenticate
opencode auth login
```

### Provider not showing in `auth login`

The `qwen-code` provider is added via plugin. In the `opencode auth login` command:

1. Select **"Other"**
2. Type `qwen-code`

### Rate limit exceeded (429 errors)

**As of v1.5.0, this should no longer occur!** The plugin now sends official Qwen Code headers that properly identify your client and prevent aggressive rate limiting.

If you still experience rate limiting:
- Ensure you're using v1.5.0 or later: `npm update opencode-qwencode-auth`
- Wait until midnight UTC for quota reset
- Try using `qwen3-coder-flash` for faster, lighter requests
- Consider [DashScope API](https://dashscope.aliyun.com) for higher limits

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/gustavodiasdev/opencode-qwencode-auth.git
cd opencode-qwencode-auth

# Install dependencies
bun install

# Type check
bun run typecheck
```

### Local testing

Edit `~/.config/opencode/package.json`:

```json
{
  "dependencies": {
    "opencode-qwencode-auth": "file:///absolute/path/to/opencode-qwencode-auth"
  }
}
```

Then reinstall:

```bash
cd ~/.config/opencode && npm install
```

## 📁 Project Structure

```
src/
├── constants.ts        # OAuth endpoints, models config
├── types.ts            # TypeScript interfaces
├── index.ts            # Main plugin entry point
├── qwen/
│   └── oauth.ts        # OAuth Device Flow + PKCE
└── plugin/
    ├── auth.ts         # Credentials management
    └── utils.ts        # Helper utilities
```

## 🔗 Related Projects

- [qwen-code](https://github.com/QwenLM/qwen-code) - Official Qwen coding CLI
- [OpenCode](https://opencode.ai) - AI-powered CLI for development
- [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) - Similar plugin for Google Gemini

## 📄 License

MIT

---

<p align="center">
  Made with ❤️ for the OpenCode community
</p>
