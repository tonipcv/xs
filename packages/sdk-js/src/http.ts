/**
 * XASE SDK - HTTP Client with Retry Logic
 */

import { XaseError, RecordResult } from './types'

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

export class HttpClient {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private timeout: number,
    private retryConfig: RetryConfig
  ) {}

  async post(
    endpoint: string,
    body: any,
    headers: Record<string, string> = {}
  ): Promise<RecordResult> {
    const url = `${this.baseUrl}${endpoint}`
    
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            ...headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        // Success (200-299)
        if (response.ok) {
          return await response.json()
        }
        
        // Rate limit (429) - retry with Retry-After
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter 
            ? parseInt(retryAfter) * 1000 
            : this.getBackoffDelay(attempt)
          
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(delay)
            continue
          }
        }
        
        // Server errors (5xx) - retry with backoff
        if (response.status >= 500) {
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(this.getBackoffDelay(attempt))
            continue
          }
        }
        
        // Client errors (4xx) - don't retry, throw immediately
        const errorData = await response.json().catch(() => ({}))
        throw new XaseError(
          errorData.error || 'Request failed',
          errorData.code || 'REQUEST_FAILED',
          response.status,
          errorData.details
        )
        
      } catch (error: any) {
        lastError = error
        
        // Network errors or timeout - retry
        if (error.name === 'AbortError' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          if (attempt < this.retryConfig.maxRetries) {
            await this.sleep(this.getBackoffDelay(attempt))
            continue
          }
        }
        
        // XaseError - don't retry, throw immediately
        if (error instanceof XaseError) {
          throw error
        }
        
        // Unknown error - don't retry
        throw new XaseError(
          error.message || 'Unknown error',
          'UNKNOWN_ERROR',
          undefined,
          error
        )
      }
    }
    
    // Max retries exceeded
    throw lastError || new XaseError('Max retries exceeded', 'MAX_RETRIES')
  }
  
  /**
   * Exponential backoff with jitter
   */
  private getBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    )
    // Jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1)
    return Math.floor(delay + jitter)
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
