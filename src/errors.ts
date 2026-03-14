/**
 * Erros customizados do plugin Qwen Auth
 *
 * Fornece mensagens amigáveis para o usuário em vez de JSON bruto da API.
 * Detalhes técnicos só aparecem com OPENCODE_QWEN_DEBUG=1.
 */

const REAUTH_HINT =
  'Execute "opencode auth login" e selecione "Qwen Code (qwen.ai OAuth)" para autenticar.';

// ============================================
// Token Manager Error Types
// ============================================

/**
 * Error types for token manager operations
 * Mirrors official client's TokenError enum
 */
export enum TokenError {
  REFRESH_FAILED = 'REFRESH_FAILED',
  NO_REFRESH_TOKEN = 'NO_REFRESH_TOKEN',
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
  FILE_ACCESS_ERROR = 'FILE_ACCESS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CREDENTIALS_CLEAR_REQUIRED = 'CREDENTIALS_CLEAR_REQUIRED',
}

// ============================================
// Erro de Autenticação
// ============================================

export type AuthErrorKind = 'token_expired' | 'refresh_failed' | 'auth_required' | 'credentials_clear_required';

const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  token_expired: `[Qwen] Token expirado. ${REAUTH_HINT}`,
  refresh_failed: `[Qwen] Falha ao renovar token. ${REAUTH_HINT}`,
  auth_required: `[Qwen] Autenticacao necessaria. ${REAUTH_HINT}`,
  credentials_clear_required: `[Qwen] Credenciais invalidas ou revogadas. ${REAUTH_HINT}`,
};

export class QwenAuthError extends Error {
  public readonly kind: AuthErrorKind;
  public readonly technicalDetail?: string;

  constructor(kind: AuthErrorKind, technicalDetail?: string) {
    super(AUTH_MESSAGES[kind]);
    this.name = 'QwenAuthError';
    this.kind = kind;
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Erro especial que sinaliza necessidade de limpar credenciais em cache.
 * Ocorre quando refresh token é revogado (invalid_grant).
 */
export class CredentialsClearRequiredError extends QwenAuthError {
  constructor(technicalDetail?: string) {
    super('credentials_clear_required', technicalDetail);
    this.name = 'CredentialsClearRequiredError';
  }
}

/**
 * Custom error class for token manager operations
 * Provides better error classification for handling
 */
export class TokenManagerError extends Error {
  public readonly type: TokenError;
  public readonly technicalDetail?: string;

  constructor(type: TokenError, message: string, technicalDetail?: string) {
    super(message);
    this.name = 'TokenManagerError';
    this.type = type;
    this.technicalDetail = technicalDetail;
  }
}

// ============================================
// Erro de API
// ============================================

/**
 * Specific error types for API errors
 */
export type ApiErrorKind = 
  | 'rate_limit'
  | 'unauthorized'
  | 'forbidden'
  | 'server_error'
  | 'network_error'
  | 'unknown';

function classifyApiStatus(statusCode: number): { message: string; kind: ApiErrorKind } {
  if (statusCode === 401 || statusCode === 403) {
    return {
      message: `[Qwen] Token invalido ou expirado. ${REAUTH_HINT}`,
      kind: 'unauthorized'
    };
  }
  if (statusCode === 429) {
    return {
      message: '[Qwen] Limite de requisicoes atingido. Aguarde alguns minutos antes de tentar novamente.',
      kind: 'rate_limit'
    };
  }
  if (statusCode >= 500) {
    return {
      message: `[Qwen] Servidor Qwen indisponivel (erro ${statusCode}). Tente novamente em alguns minutos.`,
      kind: 'server_error'
    };
  }
  return {
    message: `[Qwen] Erro na API Qwen (${statusCode}). Verifique sua conexao e tente novamente.`,
    kind: 'unknown'
  };
}

export class QwenApiError extends Error {
  public readonly statusCode: number;
  public readonly kind: ApiErrorKind;
  public readonly technicalDetail?: string;

  constructor(statusCode: number, technicalDetail?: string) {
    const classification = classifyApiStatus(statusCode);
    super(classification.message);
    this.name = 'QwenApiError';
    this.statusCode = statusCode;
    this.kind = classification.kind;
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Error for network-related issues (fetch failures, timeouts, etc.)
 */
export class QwenNetworkError extends Error {
  public readonly technicalDetail?: string;

  constructor(message: string, technicalDetail?: string) {
    super(`[Qwen] Erro de rede: ${message}`);
    this.name = 'QwenNetworkError';
    this.technicalDetail = technicalDetail;
  }
}

// ============================================
// Helper de log condicional
// ============================================

/**
 * Loga detalhes técnicos apenas quando debug está ativo.
 */
export function logTechnicalDetail(detail: string): void {
  if (process.env.OPENCODE_QWEN_DEBUG === '1') {
    console.debug('[Qwen Debug]', detail);
  }
}

/**
 * Classify error type for better error handling
 * Returns specific error kind for programmatic handling
 */
export function classifyError(error: unknown): {
  kind: 'auth' | 'api' | 'network' | 'timeout' | 'unknown';
  isRetryable: boolean;
  shouldClearCache: boolean;
} {
  // Check for our custom error types
  if (error instanceof CredentialsClearRequiredError) {
    return { kind: 'auth', isRetryable: false, shouldClearCache: true };
  }
  
  if (error instanceof QwenAuthError) {
    return {
      kind: 'auth',
      isRetryable: error.kind === 'refresh_failed',
      shouldClearCache: error.kind === 'credentials_clear_required'
    };
  }
  
  if (error instanceof QwenApiError) {
    return {
      kind: 'api',
      isRetryable: error.kind === 'rate_limit' || error.kind === 'server_error',
      shouldClearCache: false
    };
  }
  
  if (error instanceof QwenNetworkError) {
    return { kind: 'network', isRetryable: true, shouldClearCache: false };
  }
  
  // Check for timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return { kind: 'timeout', isRetryable: true, shouldClearCache: false };
  }
  
  // Check for standard Error with status
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network-related errors
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('abort')) {
      return { kind: 'network', isRetryable: true, shouldClearCache: false };
    }
  }
  
  // Default: unknown error, not retryable
  return { kind: 'unknown', isRetryable: false, shouldClearCache: false };
}
