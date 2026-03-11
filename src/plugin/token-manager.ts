/**
 * Lightweight Token Manager
 * 
 * Simplified version of qwen-code's SharedTokenManager
 * Handles:
 * - In-memory caching to avoid repeated file reads
 * - Preventive refresh (before expiration)
 * - Reactive recovery (on 401 errors)
 * - Promise tracking to avoid concurrent refreshes
 */

import { loadCredentials, saveCredentials } from './auth.js';
import { refreshAccessToken } from '../qwen/oauth.js';
import type { QwenCredentials } from '../types.js';
import { createDebugLogger } from '../utils/debug-logger.js';

const debugLogger = createDebugLogger('TOKEN_MANAGER');
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds

class TokenManager {
  private memoryCache: QwenCredentials | null = null;
  private refreshPromise: Promise<QwenCredentials | null> | null = null;

  /**
   * Get valid credentials, refreshing if necessary
   * 
   * @param forceRefresh - If true, refresh even if current token is valid
   * @returns Valid credentials or null if unavailable
   */
  async getValidCredentials(forceRefresh = false): Promise<QwenCredentials | null> {
    try {
      // 1. Check in-memory cache first (unless force refresh)
      if (!forceRefresh && this.memoryCache && this.isTokenValid(this.memoryCache)) {
        return this.memoryCache;
      }

      // 2. If concurrent refresh is already happening, wait for it
      if (this.refreshPromise) {
        debugLogger.info('Waiting for ongoing refresh...');
        return await this.refreshPromise;
      }

      // 3. Check if file has valid credentials (maybe updated by another session)
      const fromFile = loadCredentials();
      if (!forceRefresh && fromFile && this.isTokenValid(fromFile)) {
        debugLogger.info('Using valid credentials from file');
        this.memoryCache = fromFile;
        return fromFile;
      }

      // 4. Need to perform refresh
      this.refreshPromise = this.performTokenRefresh(fromFile);
      
      try {
        const result = await this.refreshPromise;
        return result;
      } finally {
        this.refreshPromise = null;
      }
    } catch (error) {
      debugLogger.error('Failed to get valid credentials:', error);
      return null;
    }
  }

  /**
   * Check if token is valid (not expired with buffer)
   */
  private isTokenValid(credentials: QwenCredentials): boolean {
    if (!credentials.expiryDate || !credentials.accessToken) {
      return false;
    }
    const isExpired = Date.now() > credentials.expiryDate - TOKEN_REFRESH_BUFFER_MS;
    return !isExpired;
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(current: QwenCredentials | null): Promise<QwenCredentials | null> {
    if (!current?.refreshToken) {
      debugLogger.warn('Cannot refresh: No refresh token available');
      return null;
    }

    try {
      debugLogger.info('Refreshing access token...');
      const refreshed = await refreshAccessToken(current.refreshToken);
      
      // Save refreshed credentials
      saveCredentials(refreshed);
      
      // Update cache
      this.memoryCache = refreshed;
      
      debugLogger.info('Token refreshed successfully');
      return refreshed;
    } catch (error) {
      debugLogger.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    this.memoryCache = null;
  }

  /**
   * Manually set credentials
   */
  setCredentials(credentials: QwenCredentials): void {
    this.memoryCache = credentials;
    saveCredentials(credentials);
  }
}

// Singleton instance
export const tokenManager = new TokenManager();
