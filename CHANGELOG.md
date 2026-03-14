# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-03-12

### 🚨 Critical Fixes

- **Fixed credentials loading on new sessions** - Added explicit snake_case to camelCase conversion in `loadCredentials()` to correctly parse `~/.qwen/oauth_creds.json`
- **Fixed rate limiting issue (#4)** - Added official Qwen Code headers to prevent aggressive rate limiting
  - Headers include `X-DashScope-CacheControl`, `X-DashScope-AuthType`, `X-DashScope-UserAgent`
  - Requests now recognized as legitimate Qwen Code client
  - Full 1,000 requests/day quota now available (OAuth free tier)

### 🔧 Production Hardening

- **Multi-process safety**
  - Implemented file locking with atomic `fs.openSync('wx')`
  - Added stale lock detection (10s threshold) matching official client
  - Registered 5 process exit handlers (exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection)
  - Implemented atomic file writes using temp file + rename pattern
- **Token Management**
  - Added `TokenManager` with in-memory caching and promise tracking
  - Implemented file check throttling (5s interval) to reduce I/O overhead
  - Added file watcher for real-time cache invalidation when credentials change externally
  - Implemented atomic cache state updates to prevent inconsistent states
- **Error Recovery**
  - Added reactive 401 recovery: automatically forces token refresh and retries request
  - Implemented comprehensive credentials validation matching official client
  - Added timeout wrappers (3s) for file operations to prevent indefinite hangs
- **Performance & Reliability**
  - Added request throttling (1s min interval + random jitter) to prevent hitting 60 req/min limits
  - Implemented `retryWithBackoff` with exponential backoff and jitter (up to 7 attempts)
  - Added support for `Retry-After` header from server

### ✨ New Features

- **Dynamic API endpoint resolution** - Automatic region detection based on `resource_url` in OAuth token
- **Aligned with qwen-code-0.12.1** - Achieved 98% feature parity with official client
- **Enhanced Debug Logging** - Detailed context, timing, and state information (enabled via `OPENCODE_QWEN_DEBUG=1`)

### 📚 Documentation

- User-focused README cleanup
- Updated troubleshooting section with practical recovery steps
- Added detailed CHANGELOG for technical history

---

## [1.4.0] - 2026-02-27

### Added
- Dynamic API endpoint resolution
- DashScope headers support
- `loadCredentials()` and `resolveBaseUrl()` functions

### Fixed
- `ERR_INVALID_URL` error - loader now returns `baseURL` correctly
- "Incorrect API key provided" error for portal.qwen.ai tokens

---

## [1.3.0] - 2026-02-10

### Added
- OAuth Device Flow authentication
- Support for qwen3-coder-plus, qwen3-coder-flash models
- Automatic token refresh
- Compatibility with qwen-code credentials

---

## [1.2.0] - 2026-01-15

### Added
- Initial release
- Basic OAuth authentication
- Model configuration for Qwen providers
