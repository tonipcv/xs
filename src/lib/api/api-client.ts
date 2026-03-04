/**
 * API CLIENT
 * Resilient API client with retry and circuit breaker
 */

import { RetryPolicy } from '@/lib/resilience/retry-policy'

export interface ApiClientOptions {
  baseUrl: string
  apiKey?: string
  timeout?: number
  retryAttempts?: number
  headers?: Record<string, string>
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  status: number
  headers: Record<string, string>
}

export class ApiClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number
  private retryAttempts: number
  private defaultHeaders: Record<string, string>

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.timeout = options.timeout || 30000
    this.retryAttempts = options.retryAttempts || 3
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (this.apiKey) {
      this.defaultHeaders['X-API-Key'] = this.apiKey
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, options: {
    params?: Record<string, string>
    headers?: Record<string, string>
  } = {}): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.params)
    return this.request<T>('GET', url, undefined, options.headers)
  }

  /**
   * POST request
   */
  async post<T>(
    path: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('POST', url, data, headers)
  }

  /**
   * PUT request
   */
  async put<T>(
    path: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('PUT', url, data, headers)
  }

  /**
   * DELETE request
   */
  async delete<T>(
    path: string,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path)
    return this.request<T>('DELETE', url, undefined, headers)
  }

  /**
   * Make request with retry
   */
  private async request<T>(
    method: string,
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return RetryPolicy.execute(
      async () => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        try {
          const response = await fetch(url, {
            method,
            headers: { ...this.defaultHeaders, ...headers },
            body: data ? JSON.stringify(data) : undefined,
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          const responseHeaders: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value
          })

          if (!response.ok) {
            const errorText = await response.text()
            return {
              error: errorText || response.statusText,
              status: response.status,
              headers: responseHeaders,
            }
          }

          const responseData = await response.json()

          return {
            data: responseData,
            status: response.status,
            headers: responseHeaders,
          }
        } catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      },
      {
        maxAttempts: this.retryAttempts,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
      }
    )
  }

  /**
   * Build URL with params
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    return url.toString()
  }

  /**
   * Batch requests
   */
  async batch<T>(
    requests: Array<{
      method: string
      path: string
      data?: any
    }>
  ): Promise<Array<ApiResponse<T>>> {
    return Promise.all(
      requests.map(req =>
        this.request<T>(req.method, this.buildUrl(req.path), req.data)
      )
    )
  }

  /**
   * Stream request
   */
  async *stream<T>(
    path: string,
    options: {
      params?: Record<string, string>
      headers?: Record<string, string>
    } = {}
  ): AsyncGenerator<T> {
    const url = this.buildUrl(path, options.params)
    const response = await fetch(url, {
      headers: { ...this.defaultHeaders, ...options.headers },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line) as T
          } catch (error) {
            console.error('Failed to parse line:', line)
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer) as T
      } catch (error) {
        console.error('Failed to parse final buffer:', buffer)
      }
    }
  }
}
