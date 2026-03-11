/**
 * Qwen Credentials Management
 *
 * Handles saving credentials to ~/.qwen/oauth_creds.json
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';

import type { QwenCredentials } from '../types.js';
import { QWEN_API_CONFIG } from '../constants.js';

/**
 * Get the path to the credentials file
 */
export function getCredentialsPath(): string {
  const homeDir = homedir();
  return join(homeDir, '.qwen', 'oauth_creds.json');
}

/**
 * Load credentials from file and map to camelCase QwenCredentials
 */
export function loadCredentials(): QwenCredentials | null {
  const credPath = getCredentialsPath();
  if (!existsSync(credPath)) {
    return null;
  }

  try {
    const content = readFileSync(credPath, 'utf8');
    const data = JSON.parse(content);
    
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      refreshToken: data.refresh_token,
      resourceUrl: data.resource_url,
      expiryDate: data.expiry_date,
      scope: data.scope,
    };
  } catch (error) {
    console.error('Failed to load Qwen credentials:', error);
    return null;
  }
}

/**
 * Resolve the API base URL based on the token region
 */
export function resolveBaseUrl(resourceUrl?: string): string {
  if (!resourceUrl) return QWEN_API_CONFIG.portalBaseUrl;

  if (resourceUrl.includes('portal.qwen.ai')) {
    return QWEN_API_CONFIG.portalBaseUrl;
  }

  if (resourceUrl.includes('dashscope')) {
    // Both dashscope and dashscope-intl use similar URL patterns
    if (resourceUrl.includes('dashscope-intl')) {
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    }
    return QWEN_API_CONFIG.defaultBaseUrl;
  }

  return QWEN_API_CONFIG.portalBaseUrl;
}

/**
 * Save credentials to file in qwen-code compatible format
 */
export function saveCredentials(credentials: QwenCredentials): void {
  const credPath = getCredentialsPath();
  const dir = join(homedir(), '.qwen');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Save in qwen-code format for compatibility
  const data = {
    access_token: credentials.accessToken,
    token_type: credentials.tokenType || 'Bearer',
    refresh_token: credentials.refreshToken,
    resource_url: credentials.resourceUrl,
    expiry_date: credentials.expiryDate,
    scope: credentials.scope,
  };

  writeFileSync(credPath, JSON.stringify(data, null, 2));
}
