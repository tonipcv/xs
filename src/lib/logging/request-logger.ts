/**
 * REQUEST/RESPONSE LOGGER
 * Comprehensive HTTP request/response logging
 */

import { NextRequest, NextResponse } from 'next/server'

export interface RequestLog {
  id: string
  timestamp: Date
  method: string
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body?: any
  ip?: string
  userAgent?: string
  tenantId?: string
  userId?: string
}

export interface ResponseLog {
  requestId: string
  status: number
  headers: Record<string, string>
  body?: any
  duration: number
  error?: string
}

export interface LogEntry {
  request: RequestLog
  response?: ResponseLog
  duration?: number
  error?: Error
}

export class RequestLogger {
  private static logs: Map<string, LogEntry> = new Map()
  private static readonly MAX_LOGS = 10000
  private static readonly RETENTION_MS = 3600000 // 1 hour

  /**
   * Log request
   */
  static logRequest(request: NextRequest, context?: {
    tenantId?: string
    userId?: string
  }): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const url = new URL(request.url)

    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      // Redact sensitive headers
      if (this.isSensitiveHeader(key)) {
        headers[key] = '[REDACTED]'
      } else {
        headers[key] = value
      }
    })

    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      query[key] = value
    })

    const requestLog: RequestLog = {
      id: requestId,
      timestamp: new Date(),
      method: request.method,
      path: url.pathname,
      query,
      headers,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      tenantId: context?.tenantId,
      userId: context?.userId,
    }

    this.logs.set(requestId, { request: requestLog })
    this.cleanup()

    return requestId
  }

  /**
   * Log response
   */
  static logResponse(
    requestId: string,
    response: NextResponse,
    duration: number
  ): void {
    const entry = this.logs.get(requestId)
    if (!entry) return

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    const responseLog: ResponseLog = {
      requestId,
      status: response.status,
      headers,
      duration,
    }

    entry.response = responseLog
    entry.duration = duration
    this.logs.set(requestId, entry)
  }

  /**
   * Log error
   */
  static logError(requestId: string, error: Error): void {
    const entry = this.logs.get(requestId)
    if (!entry) return

    entry.error = error
    this.logs.set(requestId, entry)
  }

  /**
   * Get log entry
   */
  static getLog(requestId: string): LogEntry | undefined {
    return this.logs.get(requestId)
  }

  /**
   * Get recent logs
   */
  static getRecentLogs(limit: number = 100): LogEntry[] {
    const logs = Array.from(this.logs.values())
      .sort((a, b) => b.request.timestamp.getTime() - a.request.timestamp.getTime())
      .slice(0, limit)

    return logs
  }

  /**
   * Get logs by tenant
   */
  static getLogsByTenant(tenantId: string, limit: number = 100): LogEntry[] {
    const logs = Array.from(this.logs.values())
      .filter(log => log.request.tenantId === tenantId)
      .sort((a, b) => b.request.timestamp.getTime() - a.request.timestamp.getTime())
      .slice(0, limit)

    return logs
  }

  /**
   * Get error logs
   */
  static getErrorLogs(limit: number = 100): LogEntry[] {
    const logs = Array.from(this.logs.values())
      .filter(log => log.error || (log.response && log.response.status >= 400))
      .sort((a, b) => b.request.timestamp.getTime() - a.request.timestamp.getTime())
      .slice(0, limit)

    return logs
  }

  /**
   * Get slow requests
   */
  static getSlowRequests(thresholdMs: number = 1000, limit: number = 100): LogEntry[] {
    const logs = Array.from(this.logs.values())
      .filter(log => log.duration && log.duration > thresholdMs)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, limit)

    return logs
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalRequests: number
    successRate: number
    avgDuration: number
    errorRate: number
    byMethod: Record<string, number>
    byStatus: Record<number, number>
    byPath: Record<string, number>
  } {
    const logs = Array.from(this.logs.values())
    const byMethod: Record<string, number> = {}
    const byStatus: Record<number, number> = {}
    const byPath: Record<string, number> = {}
    let totalDuration = 0
    let errorCount = 0

    for (const log of logs) {
      byMethod[log.request.method] = (byMethod[log.request.method] || 0) + 1
      byPath[log.request.path] = (byPath[log.request.path] || 0) + 1

      if (log.response) {
        byStatus[log.response.status] = (byStatus[log.response.status] || 0) + 1
        totalDuration += log.response.duration
      }

      if (log.error || (log.response && log.response.status >= 400)) {
        errorCount++
      }
    }

    const totalRequests = logs.length
    const successRate = totalRequests > 0 ? ((totalRequests - errorCount) / totalRequests) * 100 : 0
    const avgDuration = totalRequests > 0 ? totalDuration / totalRequests : 0
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0

    return {
      totalRequests,
      successRate,
      avgDuration,
      errorRate,
      byMethod,
      byStatus,
      byPath,
    }
  }

  /**
   * Check if header is sensitive
   */
  private static isSensitiveHeader(key: string): boolean {
    const sensitive = [
      'authorization',
      'x-api-key',
      'cookie',
      'set-cookie',
      'x-auth-token',
    ]

    return sensitive.includes(key.toLowerCase())
  }

  /**
   * Cleanup old logs
   */
  private static cleanup(): void {
    if (this.logs.size <= this.MAX_LOGS) return

    const cutoff = Date.now() - this.RETENTION_MS
    const toDelete: string[] = []

    for (const [id, entry] of this.logs.entries()) {
      if (entry.request.timestamp.getTime() < cutoff) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      this.logs.delete(id)
    }

    // If still over limit, remove oldest
    if (this.logs.size > this.MAX_LOGS) {
      const sorted = Array.from(this.logs.entries())
        .sort((a, b) => a[1].request.timestamp.getTime() - b[1].request.timestamp.getTime())

      const toRemove = sorted.slice(0, this.logs.size - this.MAX_LOGS)
      for (const [id] of toRemove) {
        this.logs.delete(id)
      }
    }
  }

  /**
   * Export logs
   */
  static exportLogs(format: 'json' | 'csv' = 'json'): string {
    const logs = this.getRecentLogs(1000)

    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    }

    // CSV format
    const headers = [
      'timestamp',
      'method',
      'path',
      'status',
      'duration',
      'tenantId',
      'error',
    ]

    const rows = logs.map(log => [
      log.request.timestamp.toISOString(),
      log.request.method,
      log.request.path,
      log.response?.status || '',
      log.duration || '',
      log.request.tenantId || '',
      log.error?.message || '',
    ])

    return [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n')
  }

  /**
   * Clear all logs
   */
  static clear(): void {
    this.logs.clear()
  }
}
