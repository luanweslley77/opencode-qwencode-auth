# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-03-09

### 🚨 Critical Fixes

- **Fixed rate limiting issue (#4)** - Added official Qwen Code headers to prevent aggressive rate limiting
  - Added `QWEN_OFFICIAL_HEADERS` constant with required identification headers
  - Headers include `X-DashScope-CacheControl`, `X-DashScope-AuthType`, `X-DashScope-UserAgent`
  - Requests now recognized as legitimate Qwen Code client
  - Full 2,000 requests/day quota now available

- **Added session and prompt tracking** - Prevents false-positive abuse detection
  - Unique `sessionId` per plugin lifetime
  - Unique `promptId` per request via `crypto.randomUUID()`
  - `X-Metadata` header with tracking information

### ✨ New Features

- **Dynamic API endpoint resolution** - Automatic region detection based on OAuth token
  - `portal.qwen.ai` → `https://portal.qwen.ai/v1` (International)
  - `dashscope` → `https://dashscope.aliyuncs.com/compatible-mode/v1` (China)
  - `dashscope-intl` → `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (International)
  - Added `loadCredentials()` function to read `resource_url` from credentials file
  - Added `resolveBaseUrl()` function for intelligent URL resolution

- **Added qwen3.5-plus model support** - Latest flagship hybrid model
  - 1M token context window
  - 64K token max output
  - Reasoning capabilities enabled
  - Vision support included

- **Vision model capabilities** - Proper modalities configuration
  - Dynamic `modalities.input` based on model capabilities
  - Vision models now correctly advertise `['text', 'image']` input
  - Non-vision models remain `['text']` only

### 🔧 Technical Improvements

- **Enhanced loader hook** - Returns complete configuration with headers
  - Headers injected at loader level for all requests
  - Metadata object for backend quota recognition
  - Session-based tracking for usage patterns

- **Enhanced config hook** - Consistent header configuration
  - Headers set in provider options
  - Dynamic modalities based on model capabilities
  - Better type safety for vision features

- **Improved auth module** - Better credentials management
  - Added `loadCredentials()` for reading from file
  - Better error handling in credential loading
  - Support for multi-region tokens

### 📚 Documentation

- Updated README with new features section
- Added troubleshooting section for rate limiting
- Updated model table with `qwen3.5-plus`
- Added vision model documentation
- Enhanced installation instructions

### 🔄 Changes from Previous Versions

#### Compared to 1.4.0 (PR #7 by @ishan-parihar)

This version includes all features from PR #7 plus:
- Complete official headers (not just DashScope-specific)
- Session and prompt tracking for quota recognition
- `qwen3.5-plus` model support
- Vision capabilities in modalities
- Direct fix for Issue #4 (rate limiting)

---

## [1.4.0] - 2026-02-27

### Added
- Dynamic API endpoint resolution (PR #7)
- DashScope headers support (PR #7)
- `loadCredentials()` and `resolveBaseUrl()` functions (PR #7)

### Fixed
- `ERR_INVALID_URL` error - loader now returns `baseURL` correctly (PR #7)
- "Incorrect API key provided" error for portal.qwen.ai tokens (PR #7)

---

## [1.3.0] - 2026-02-10

### Added
- OAuth Device Flow authentication
- Support for qwen3-coder-plus, qwen3-coder-flash models
- Automatic token refresh
- Compatibility with qwen-code credentials

### Known Issues
- Rate limiting reported by users (Issue #4)
- Missing official headers for quota recognition

---

## [1.2.0] - 2026-01-15

### Added
- Initial release
- Basic OAuth authentication
- Model configuration for Qwen providers
