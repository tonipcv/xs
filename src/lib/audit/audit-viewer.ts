/**
 * AUDIT TRAIL VIEWER
 * Query and analyze audit logs with advanced filtering
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface AuditFilter {
  tenantId?: string
  userId?: string
  action?: string[]
  resourceType?: string[]
  resourceId?: string
  status?: string[]
  startDate?: Date
  endDate?: Date
  ipAddress?: string
  searchQuery?: string
}

export interface AuditEntry {
  id: string
  tenantId: string
  userId?: string
  action: string
  resourceType: string
  resourceId: string
  metadata?: any
  ipAddress?: string
  userAgent?: string
  status: string
  timestamp: Date
}

export interface AuditStats {
  totalEvents: number
  byAction: Record<string, number>
  byResourceType: Record<string, number>
  byStatus: Record<string, number>
  byUser: Record<string, number>
  timeline: Array<{ date: string; count: number }>
}

export class AuditViewer {
  /**
   * Query audit logs with filters
   */
  static async queryLogs(
    filter: AuditFilter,
    options: {
      page?: number
      limit?: number
      sortBy?: 'timestamp' | 'action' | 'status'
      sortOrder?: 'asc' | 'desc'
    } = {}
  ): Promise<{
    logs: AuditEntry[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }> {
    const page = options.page || 1
    const limit = Math.min(options.limit || 50, 1000)
    const skip = (page - 1) * limit
    const sortBy = options.sortBy || 'timestamp'
    const sortOrder = options.sortOrder || 'desc'

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        filter.tenantId ? { tenantId: filter.tenantId } : {},
        filter.userId ? { userId: filter.userId } : {},
        filter.action && filter.action.length > 0
          ? { action: { in: filter.action } }
          : {},
        filter.resourceType && filter.resourceType.length > 0
          ? { resourceType: { in: filter.resourceType } }
          : {},
        filter.resourceId ? { resourceId: filter.resourceId } : {},
        filter.status && filter.status.length > 0
          ? { status: { in: filter.status } }
          : {},
        filter.startDate || filter.endDate
          ? {
              timestamp: {
                ...(filter.startDate ? { gte: filter.startDate } : {}),
                ...(filter.endDate ? { lte: filter.endDate } : {}),
              },
            }
          : {},
        filter.ipAddress ? { ipAddress: filter.ipAddress } : {},
        filter.searchQuery
          ? {
              OR: [
                { action: { contains: filter.searchQuery, mode: 'insensitive' } },
                { resourceType: { contains: filter.searchQuery, mode: 'insensitive' } },
                { resourceId: { contains: filter.searchQuery, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    }

    // Execute query
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.auditLog.count({ where }),
    ])

    return {
      logs: logs as AuditEntry[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Get audit statistics
   */
  static async getStatistics(
    filter: AuditFilter,
    timeGrouping: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<AuditStats> {
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        filter.tenantId ? { tenantId: filter.tenantId } : {},
        filter.startDate || filter.endDate
          ? {
              timestamp: {
                ...(filter.startDate ? { gte: filter.startDate } : {}),
                ...(filter.endDate ? { lte: filter.endDate } : {}),
              },
            }
          : {},
      ],
    }

    // Get all logs for aggregation
    const logs = await prisma.auditLog.findMany({
      where,
      select: {
        action: true,
        resourceType: true,
        status: true,
        userId: true,
        timestamp: true,
      },
    })

    // Aggregate statistics
    const byAction: Record<string, number> = {}
    const byResourceType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byUser: Record<string, number> = {}
    const timelineCounts: Record<string, number> = {}

    for (const log of logs) {
      // By action
      byAction[log.action] = (byAction[log.action] || 0) + 1

      // By resource type
      byResourceType[log.resourceType] = (byResourceType[log.resourceType] || 0) + 1

      // By status
      byStatus[log.status] = (byStatus[log.status] || 0) + 1

      // By user
      if (log.userId) {
        byUser[log.userId] = (byUser[log.userId] || 0) + 1
      }

      // Timeline
      const dateKey = this.getTimelineKey(log.timestamp, timeGrouping)
      timelineCounts[dateKey] = (timelineCounts[dateKey] || 0) + 1
    }

    // Convert timeline to array
    const timeline = Object.entries(timelineCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalEvents: logs.length,
      byAction,
      byResourceType,
      byStatus,
      byUser,
      timeline,
    }
  }

  /**
   * Get timeline key based on grouping
   */
  private static getTimelineKey(
    date: Date,
    grouping: 'hour' | 'day' | 'week' | 'month'
  ): string {
    const d = new Date(date)

    switch (grouping) {
      case 'hour':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`
      case 'day':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      case 'week':
        const weekStart = new Date(d)
        weekStart.setDate(d.getDate() - d.getDay())
        return `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate()) / 7)).padStart(2, '0')}`
      case 'month':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  }

  /**
   * Get user activity timeline
   */
  static async getUserActivity(
    userId: string,
    tenantId: string,
    days: number = 30
  ): Promise<{
    totalActions: number
    recentActions: AuditEntry[]
    activityByDay: Array<{ date: string; count: number }>
  }> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const logs = await prisma.auditLog.findMany({
      where: {
        userId,
        tenantId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    // Group by day
    const activityByDay: Record<string, number> = {}
    for (const log of logs) {
      const dateKey = this.getTimelineKey(log.timestamp, 'day')
      activityByDay[dateKey] = (activityByDay[dateKey] || 0) + 1
    }

    return {
      totalActions: logs.length,
      recentActions: logs.slice(0, 10) as AuditEntry[],
      activityByDay: Object.entries(activityByDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  }

  /**
   * Get resource access history
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string,
    tenantId: string
  ): Promise<AuditEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType,
        resourceId,
        tenantId,
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    return logs as AuditEntry[]
  }

  /**
   * Detect suspicious activity
   */
  static async detectSuspiciousActivity(
    tenantId: string,
    lookbackHours: number = 24
  ): Promise<{
    suspiciousEvents: Array<{
      type: string
      description: string
      count: number
      events: AuditEntry[]
    }>
  }> {
    const startDate = new Date()
    startDate.setHours(startDate.getHours() - lookbackHours)

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
    })

    const suspiciousEvents: Array<{
      type: string
      description: string
      count: number
      events: AuditEntry[]
    }> = []

    // Detect failed login attempts
    const failedLogins = logs.filter(
      log => log.action === 'LOGIN' && log.status === 'FAILED'
    )
    if (failedLogins.length > 10) {
      suspiciousEvents.push({
        type: 'FAILED_LOGINS',
        description: 'Multiple failed login attempts detected',
        count: failedLogins.length,
        events: failedLogins.slice(0, 10) as AuditEntry[],
      })
    }

    // Detect bulk deletions
    const deletions = logs.filter(log => log.action === 'DELETE')
    if (deletions.length > 50) {
      suspiciousEvents.push({
        type: 'BULK_DELETION',
        description: 'Unusual number of deletions detected',
        count: deletions.length,
        events: deletions.slice(0, 10) as AuditEntry[],
      })
    }

    // Detect access from multiple IPs
    const ipsByUser: Record<string, Set<string>> = {}
    for (const log of logs) {
      if (log.userId && log.ipAddress) {
        if (!ipsByUser[log.userId]) {
          ipsByUser[log.userId] = new Set()
        }
        ipsByUser[log.userId].add(log.ipAddress)
      }
    }

    for (const [userId, ips] of Object.entries(ipsByUser)) {
      if (ips.size > 5) {
        const userLogs = logs.filter(log => log.userId === userId)
        suspiciousEvents.push({
          type: 'MULTIPLE_IPS',
          description: `User accessed from ${ips.size} different IP addresses`,
          count: ips.size,
          events: userLogs.slice(0, 10) as AuditEntry[],
        })
      }
    }

    return { suspiciousEvents }
  }

  /**
   * Export audit logs
   */
  static async exportLogs(
    filter: AuditFilter,
    format: 'csv' | 'json' = 'json'
  ): Promise<string> {
    const { logs } = await this.queryLogs(filter, { limit: 10000 })

    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    }

    // CSV format
    const headers = ['timestamp', 'action', 'resourceType', 'resourceId', 'status', 'userId', 'ipAddress']
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.action,
      log.resourceType,
      log.resourceId,
      log.status,
      log.userId || '',
      log.ipAddress || '',
    ])

    return [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n')
  }

  /**
   * Get compliance report
   */
  static async getComplianceReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: { start: Date; end: Date }
    totalEvents: number
    dataAccess: number
    dataModification: number
    dataExport: number
    failedAttempts: number
    uniqueUsers: number
    complianceScore: number
  }> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    const dataAccess = logs.filter(log =>
      ['READ', 'VIEW', 'ACCESS'].includes(log.action)
    ).length

    const dataModification = logs.filter(log =>
      ['CREATE', 'UPDATE', 'DELETE'].includes(log.action)
    ).length

    const dataExport = logs.filter(log =>
      log.action === 'EXPORT'
    ).length

    const failedAttempts = logs.filter(log =>
      log.status === 'FAILED'
    ).length

    const uniqueUsers = new Set(logs.map(log => log.userId).filter(Boolean)).size

    // Simple compliance score (0-100)
    const complianceScore = Math.min(
      100,
      Math.max(
        0,
        100 - (failedAttempts / logs.length) * 100
      )
    )

    return {
      period: { start: startDate, end: endDate },
      totalEvents: logs.length,
      dataAccess,
      dataModification,
      dataExport,
      failedAttempts,
      uniqueUsers,
      complianceScore,
    }
  }

  /**
   * Search audit logs with full-text search
   */
  static async searchLogs(
    tenantId: string,
    searchQuery: string,
    limit: number = 100
  ): Promise<AuditEntry[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { action: { contains: searchQuery, mode: 'insensitive' } },
          { resourceType: { contains: searchQuery, mode: 'insensitive' } },
          { resourceId: { contains: searchQuery, mode: 'insensitive' } },
          { metadata: { path: '$', string_contains: searchQuery } },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return logs as AuditEntry[]
  }
}
