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
    // Ignore errors
  }
}

/** Obtem um access token valido (com refresh se necessario) */
async function getValidAccessToken(
  getAuth: () => Promise<{ type: string; access?: string; refresh?: string; expires?: number }>,
): Promise<string | null> {
  const auth = await getAuth();

  if (!auth || auth.type !== 'oauth') {
    return null;
  }

  let accessToken = auth.access;

  // Refresh se expirado (com margem de 60s)
  if (accessToken && auth.expires && Date.now() > auth.expires - 60_000 && auth.refresh) {
    try {
      const refreshed = await refreshAccessToken(auth.refresh);
      accessToken = refreshed.accessToken;
      saveCredentials(refreshed);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logTechnicalDetail(`Token refresh falhou: ${detail}`);
      accessToken = undefined;
    }
  }

  return accessToken ?? null;
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
            'X-Metadata': JSON.stringify({
              sessionId: PLUGIN_SESSION_ID,
              promptId: randomUUID(),
              source: 'opencode-qwencode-auth'
            })
          },
          // Custom fetch with throttling, retry and 401 recovery
          fetch: async (url: string, options: any = {}) => {
            return requestQueue.enqueue(async () => {
              let retryCount401 = 0;

              return retryWithBackoff(
                async () => {
                  // Always get latest token (it might have been refreshed)
                  const currentCreds = await tokenManager.getValidCredentials();
                  const token = currentCreds?.accessToken;
                  
                  if (!token) throw new Error('No access token available');

                  // Prepare headers
                  const headers: Record<string, string> = {
                    ...QWEN_OFFICIAL_HEADERS,
                    ...(options.headers || {}),
                    'Authorization': `Bearer ${token}`,
                    'X-Metadata': JSON.stringify({
                      sessionId: PLUGIN_SESSION_ID,
                      promptId: randomUUID(),
                      source: 'opencode-qwencode-auth'
                    })
                  };

                  const response = await fetch(url, {
                    ...options,
                    headers
                  });

                  // Handle 401: Force refresh once
                  if (response.status === 401 && retryCount401 < 1) {
                    retryCount401++;
                    debugLogger.warn('401 Unauthorized detected. Forcing token refresh...');
                    await tokenManager.getValidCredentials(true);
                    
                    const error: any = new Error('Unauthorized - retrying after refresh');
                    error.status = 401;
                    throw error;
                  }

                  if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    const error: any = new Error(`HTTP ${response.status}: ${errorText}`);
                    error.status = response.status;
                    throw error;
                  }

                  return response;
                },
                {
                  authType: 'qwen-oauth',
                  maxAttempts: 7,
                  shouldRetryOnError: (error: any) => {
                    const status = error.status || getErrorStatus(error);
                    // Retry on 401 (if within limit), 429 (rate limit), and 5xx (server errors)
                    return status === 401 || status === 429 || (status !== undefined && status >= 500 && status < 600);
                  }
                }
              );
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
