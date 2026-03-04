/**
 * ERROR HANDLER
 * Centralized error handling and logging
 */

export interface ErrorContext {
  userId?: string
  tenantId?: string
  requestId?: string
  endpoint?: string
  metadata?: Record<string, any>
}

export interface ErrorLog {
  id: string
  timestamp: Date
  error: Error
  context?: ErrorContext
  stack?: string
  handled: boolean
}

export class ErrorHandler {
  private static logs: ErrorLog[] = []
  private static readonly MAX_LOGS = 1000

  /**
   * Handle error
   */
  static handle(error: Error, context?: ErrorContext): void {
    const log: ErrorLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      error,
      context,
      stack: error.stack,
      handled: true,
    }

    this.logs.push(log)

    // Trim logs if needed
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS)
    }

    // Log to console
    console.error('[ErrorHandler]', {
      message: error.message,
      context,
      stack: error.stack,
    })

    // In production, would send to error tracking service
  }

  /**
   * Handle async error
   */
  static async handleAsync<T>(
    fn: () => Promise<T>,
    context?: ErrorContext
  ): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      this.handle(error as Error, context)
      return null
    }
  }

  /**
   * Wrap function with error handling
   */
  static wrap<T extends (...args: any[]) => any>(
    fn: T,
    context?: ErrorContext
  ): T {
    return ((...args: any[]) => {
      try {
        const result = fn(...args)
        if (result instanceof Promise) {
          return result.catch((error: Error) => {
            this.handle(error, context)
            throw error
          })
        }
        return result
      } catch (error) {
        this.handle(error as Error, context)
        throw error
      }
    }) as T
  }

  /**
   * Get recent errors
   */
  static getRecentErrors(limit: number = 50): ErrorLog[] {
    return this.logs.slice(-limit).reverse()
  }

  /**
   * Get errors by context
   */
  static getErrorsByContext(
    key: keyof ErrorContext,
    value: string,
    limit: number = 50
  ): ErrorLog[] {
    return this.logs
      .filter(log => log.context && log.context[key] === value)
      .slice(-limit)
      .reverse()
  }

  /**
   * Get error statistics
   */
  static getStatistics(): {
    total: number
    byType: Record<string, number>
    byEndpoint: Record<string, number>
    recentCount: number
  } {
    const byType: Record<string, number> = {}
    const byEndpoint: Record<string, number> = {}
    const oneHourAgo = Date.now() - 3600000

    let recentCount = 0

    for (const log of this.logs) {
      const errorType = log.error.constructor.name
      byType[errorType] = (byType[errorType] || 0) + 1

      if (log.context?.endpoint) {
        byEndpoint[log.context.endpoint] = (byEndpoint[log.context.endpoint] || 0) + 1
      }

      if (log.timestamp.getTime() > oneHourAgo) {
        recentCount++
      }
    }

    return {
      total: this.logs.length,
      byType,
      byEndpoint,
      recentCount,
    }
  }

  /**
   * Clear logs
   */
  static clear(): void {
    this.logs = []
  }

  /**
   * Create error from code
   */
  static createError(code: string, message: string): Error {
    const error = new Error(message)
    error.name = code
    return error
  }

  /**
   * Is retryable error
   */
  static isRetryable(error: Error): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'NetworkError',
      'TimeoutError',
    ]

    return retryableErrors.some(pattern =>
      error.message.includes(pattern) || error.name.includes(pattern)
    )
  }

  /**
   * Format error for response
   */
  static formatForResponse(error: Error): {
    error: string
    message: string
    code?: string
  } {
    return {
      error: error.name,
      message: error.message,
      code: error.name,
    }
  }

  /**
   * Export error logs
   */
  static export(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2)
    }

    // CSV format
    const headers = ['timestamp', 'error', 'message', 'endpoint', 'userId']
    const rows = this.logs.map(log => [
      log.timestamp.toISOString(),
      log.error.name,
      log.error.message,
      log.context?.endpoint || '',
      log.context?.userId || '',
    ])

    return [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n')
  }
}
