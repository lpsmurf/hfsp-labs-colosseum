// STREAM 3 & 4: Error Classification + Logging (Kimi)
// Task 3.3: Error classification for retry logic

export class HFSPError extends Error {
  constructor(
    message: string,
    public error_type: 'transient' | 'permanent' | 'unknown',
    public status_code?: number
  ) {
    super(message);
    this.name = 'HFSPError';
    Object.setPrototypeOf(this, HFSPError.prototype);
  }
}

/**
 * Classify errors to determine retry strategy
 * - 4xx (400, 404) = permanent (fail immediately)
 * - 5xx (500+) = transient (retry with backoff)
 * - Network errors = transient (retry with backoff)
 * - Unknown = unknown (retry but with caution)
 */
export function classifyError(error: any): 'transient' | 'permanent' | 'unknown' {
  // HTTP status code errors
  if (error.response?.status) {
    const status = error.response.status;
    
    // 4xx errors are permanent (except 429 which is transient rate limiting)
    if (status >= 400 && status < 500) {
      if (status === 429) {
        return 'transient'; // Rate limiting is transient
      }
      return 'permanent'; // 400, 401, 403, 404, etc.
    }
    
    // 5xx errors are transient (server issues)
    if (status >= 500) {
      return 'transient';
    }
  }
  
  // Network errors are transient
  if (error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'EHOSTUNREACH' ||
      error.code === 'ENETUNREACH' ||
      error.message?.includes('ENOTFOUND') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNREFUSED')) {
    return 'transient';
  }
  
  // Default to unknown
  return 'unknown';
}

/**
 * Get a human-readable error message based on classification
 */
export function getErrorMessage(error: any, classification: string): string {
  if (error.response?.status === 404) {
    return 'Agent not found (404) - deployment may not exist';
  }
  if (error.response?.status === 400) {
    return 'Bad request (400) - invalid deployment parameters';
  }
  if (error.response?.status === 401 || error.response?.status === 403) {
    return 'Unauthorized (401/403) - check HFSP API credentials';
  }
  if (error.response?.status >= 500) {
    return `Server error (${error.response.status}) - HFSP service unavailable`;
  }
  if (error.code === 'ETIMEDOUT') {
    return 'Connection timeout - HFSP service not responding';
  }
  if (error.code === 'ECONNREFUSED') {
    return 'Connection refused - HFSP service unreachable';
  }
  
  return error.message || 'Unknown error';
}
