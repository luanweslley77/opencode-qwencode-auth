/**
 * OpenCode Qwen Auth Plugin
 *
 * Plugin de autenticacao OAuth para Qwen, baseado no qwen-code.
 * Implementa Device Flow (RFC 8628) para autenticacao.
 *
 * Provider: qwen-code -> portal.qwen.ai/v1
 * Modelos: qwen3-coder-plus, qwen3-coder-flash, coder-model, vision-model
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { QWEN_PROVIDER_ID, QWEN_API_CONFIG, QWEN_MODELS, QWEN_OFFICIAL_HEADERS } from './constants.js';
import type { QwenCredentials } from './types.js';
import { resolveBaseUrl } from './plugin/auth.js';
import {
  generatePKCE,
  requestDeviceAuthorization,
  pollDeviceToken,
  tokenResponseToCredentials,
  SlowDownError,
} from './qwen/oauth.js';
import { retryWithBackoff, getErrorStatus } from './utils/retry.js';
import { RequestQueue } from './plugin/request-queue.js';
import { tokenManager } from './plugin/token-manager.js';
import { createDebugLogger } from './utils/debug-logger.js';

const debugLogger = createDebugLogger('PLUGIN');

// Global session ID for the plugin lifetime
const PLUGIN_SESSION_ID = randomUUID();

// Singleton request queue for throttling (shared across all requests)
const requestQueue = new RequestQueue();

// ============================================
// Helpers
// ============================================

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32' : 'xdg-open';
    const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref?.();
  } catch {
    // Fallback: show URL in stderr
    console.error('\n[Qwen Auth] Unable to open browser automatically.');
    console.error('Please open this URL manually to authenticate:\n');
    console.error(`  ${url}\n`);
  }
}

/**
 * Check if error is authentication-related (401, 403, token expired)
 * Mirrors official client's isAuthError logic
 */
function isAuthError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error
    ? error.message.toLowerCase()
    : String(error).toLowerCase();

  const status = getErrorStatus(error);

  return (
    status === 401 ||
    status === 403 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid access token') ||
    errorMessage.includes('invalid api key') ||
    errorMessage.includes('token expired') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('access denied') ||
    (errorMessage.includes('token') && errorMessage.includes('expired'))
  );
}

// ============================================
// Plugin Principal
// ============================================

export const QwenAuthPlugin = async (_input: unknown) => {
  return {
    auth: {
      provider: QWEN_PROVIDER_ID,

      loader: async (
        getAuth: any,
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> },
      ) => {
        // Zerar custo dos modelos (gratuito via OAuth)
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        // Get latest valid credentials
        const credentials = await tokenManager.getValidCredentials();
        if (!credentials?.accessToken) return null;

        const baseURL = resolveBaseUrl(credentials.resourceUrl);

        return {
          apiKey: credentials.accessToken,
          baseURL: baseURL,
          headers: {
            ...QWEN_OFFICIAL_HEADERS,
          },
          // Custom fetch with throttling, retry and 401 recovery
          fetch: async (url: string, options: any = {}) => {
            return requestQueue.enqueue(async () => {
              let authRetryCount = 0;

              const executeRequest = async (): Promise<Response> => {
                // Get latest token (possibly refreshed by concurrent request)
                const currentCreds = await tokenManager.getValidCredentials();
                const token = currentCreds?.accessToken;
                
                if (!token) throw new Error('No access token available');

                // Prepare merged headers
                const mergedHeaders: Record<string, string> = {
                  ...QWEN_OFFICIAL_HEADERS,
                };

                // Merge provided headers (handles both plain object and Headers instance)
                if (options.headers) {
                  if (typeof (options.headers as any).entries === 'function') {
                    for (const [k, v] of (options.headers as any).entries()) {
                      const kl = k.toLowerCase();
                      if (!kl.startsWith('x-dashscope') && kl !== 'user-agent' && kl !== 'authorization') {
                        mergedHeaders[k] = v;
                      }
                    }
                  } else {
                    for (const [k, v] of Object.entries(options.headers)) {
                      const kl = k.toLowerCase();
                      if (!kl.startsWith('x-dashscope') && kl !== 'user-agent' && kl !== 'authorization') {
                        mergedHeaders[k] = v as string;
                      }
                    }
                  }
                }

                // Force our Authorization token
                mergedHeaders['Authorization'] = `Bearer ${token}`;

                // Optional: X-Metadata might be expected by some endpoints for free quota tracking
                // but let's try without it first to match official client closer
                // mergedHeaders['X-Metadata'] = JSON.stringify({ ... });

                // Perform the request
                const response = await fetch(url, {
                  ...options,
                  headers: mergedHeaders
                });

                // Reactive recovery for 401 (token expired mid-session)
                if (response.status === 401 && authRetryCount < 1) {
                  authRetryCount++;
                  debugLogger.warn('401 Unauthorized detected. Forcing token refresh...', {
                    url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
                    attempt: authRetryCount,
                    maxRetries: 1
                  });
                  
                  // Force refresh from API
                  const refreshStart = Date.now();
                  const refreshed = await tokenManager.getValidCredentials(true);
                  const refreshElapsed = Date.now() - refreshStart;
                  
                  if (refreshed?.accessToken) {
                    debugLogger.info('Token refreshed successfully, retrying request...', {
                      refreshElapsed,
                      newTokenExpiry: refreshed.expiryDate ? new Date(refreshed.expiryDate).toISOString() : 'N/A'
                    });
                    return executeRequest(); // Recursive retry with new token
                  } else {
                    debugLogger.error('Failed to refresh token after 401', {
                      refreshElapsed,
                      hasRefreshToken: !!refreshed?.accessToken
                    });
                  }
                }

                // Error handling for retryWithBackoff
                if (!response.ok) {
                  const errorText = await response.text().catch(() => '');
                  const error: any = new Error(`HTTP ${response.status}: ${errorText}`);
                  error.status = response.status;
                  
                  // Add context for debugging
                  debugLogger.error('Request failed', {
                    status: response.status,
                    statusText: response.statusText,
                    url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
                    method: options?.method || 'GET',
                    errorText: errorText.substring(0, 200) + (errorText.length > 200 ? '...' : '')
                  });
                  
                  throw error;
                }

                return response;
              };

              // Use official retry logic for 429/5xx errors
              return retryWithBackoff(() => executeRequest(), {
                authType: 'qwen-oauth',
                maxAttempts: 7,
                shouldRetryOnError: (error: any) => {
                  const status = error.status || getErrorStatus(error);
                  // Retry on 401 (handled by executeRequest recursion too), 429, and 5xx
                  return status === 401 || status === 429 || (status !== undefined && status >= 500 && status < 600);
                }
              });
            });
          }
        };
      },

      methods: [
        {
          type: 'oauth' as const,
          label: 'Qwen Code (qwen.ai OAuth)',
          authorize: async () => {
            const { verifier, challenge } = generatePKCE();

            try {
              const deviceAuth = await requestDeviceAuthorization(challenge);
              openBrowser(deviceAuth.verification_uri_complete);

              const POLLING_MARGIN_MS = 3000;

              return {
                url: deviceAuth.verification_uri_complete,
                instructions: `Codigo: ${deviceAuth.user_code}`,
                method: 'auto' as const,
                callback: async () => {
                  const startTime = Date.now();
                  const timeoutMs = deviceAuth.expires_in * 1000;
                  let interval = 5000;

                  while (Date.now() - startTime < timeoutMs) {
                    await new Promise(resolve => setTimeout(resolve, interval + POLLING_MARGIN_MS));

                    try {
                      const tokenResponse = await pollDeviceToken(deviceAuth.device_code, verifier);

                      if (tokenResponse) {
                        const credentials = tokenResponseToCredentials(tokenResponse);
                        tokenManager.setCredentials(credentials);

                        return {
                          type: 'success' as const,
                          access: credentials.accessToken,
                          refresh: credentials.refreshToken ?? '',
                          expires: credentials.expiryDate || Date.now() + 3600000,
                        };
                      }
                    } catch (e) {
                      if (e instanceof SlowDownError) {
                        interval = Math.min(interval + 5000, 15000);
                      } else if (!(e instanceof Error) || !e.message.includes('authorization_pending')) {
                        return { type: 'failed' as const };
                      }
                    }
                  }

                  return { type: 'failed' as const };
                },
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Erro desconhecido';
              return {
                url: '',
                instructions: `Erro: ${msg}`,
                method: 'auto' as const,
                callback: async () => ({ type: 'failed' as const }),
              };
            }
          },
        },
      ],
    },

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};

      providers[QWEN_PROVIDER_ID] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Qwen Code',
        options: { 
          baseURL: QWEN_API_CONFIG.baseUrl,
          headers: QWEN_OFFICIAL_HEADERS
        },
        models: Object.fromEntries(
          Object.entries(QWEN_MODELS).map(([id, m]) => {
            const hasVision = 'capabilities' in m && m.capabilities?.vision;
            return [
              id,
              {
                id: m.id,
                name: m.name,
                reasoning: m.reasoning,
                limit: { context: m.contextWindow, output: m.maxOutput },
                cost: m.cost,
                modalities: { 
                  input: hasVision ? ['text', 'image'] : ['text'], 
                  output: ['text'] 
                },
              },
            ];
          })
        ),
      };

      config.provider = providers;
    },
  };
};

export default QwenAuthPlugin;
