/**
 * ALERT MANAGER
 * Manage and dispatch system alerts
 */

import { prisma } from '@/lib/prisma'
import { WebhookManager } from '@/lib/webhooks/webhook-manager'

export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
export type AlertCategory = 
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'QUOTA'
  | 'HEALTH'
  | 'COMPLIANCE'
  | 'BILLING'

export interface Alert {
  id: string
  tenantId: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  message: string
  metadata?: any
  createdAt: Date
  acknowledgedAt?: Date
  acknowledgedBy?: string
  resolvedAt?: Date
  resolvedBy?: string
}

export interface AlertRule {
  id: string
  name: string
  category: AlertCategory
  condition: (context: any) => boolean
  severity: AlertSeverity
  message: string
  cooldownMinutes: number
}

export class AlertManager {
  private static readonly ALERT_PREFIX = 'alerts:'
  private static rules: AlertRule[] = []

  /**
   * Register alert rule
   */
  static registerRule(rule: AlertRule): void {
    this.rules.push(rule)
  }

  /**
   * Create alert
   */
  static async createAlert(
    tenantId: string,
    category: AlertCategory,
    severity: AlertSeverity,
    title: string,
    message: string,
    metadata?: any
  ): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      tenantId,
      category,
      severity,
      title,
      message,
      metadata,
      createdAt: new Date(),
    }

    // Store in database
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'ALERT_CREATED',
          resourceType: 'ALERT',
          resourceId: alert.id,
          metadata: JSON.stringify({
            category,
            severity,
            title,
            message,
            ...metadata,
          }),
          status: 'SUCCESS',
        },
      })
    } catch (error) {
      console.error('[AlertManager] Failed to store alert:', error)
    }

    // Send webhook notification
    await this.notifyAlert(alert)

    return alert
  }

  /**
   * Notify alert via webhooks
   */
  private static async notifyAlert(alert: Alert): Promise<void> {
    try {
      await WebhookManager.emit(alert.tenantId, 'dataset.created', {
        alertId: alert.id,
        category: alert.category,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
      })
    } catch (error) {
      console.error('[AlertManager] Failed to send webhook:', error)
    }
  }

  /**
   * Acknowledge alert
   */
  static async acknowledgeAlert(
    alertId: string,
    userId: string
  ): Promise<void> {
    // In production, would update database
    console.log(`[AlertManager] Alert ${alertId} acknowledged by ${userId}`)
  }

  /**
   * Resolve alert
   */
  static async resolveAlert(
    alertId: string,
    userId: string,
    resolution?: string
  ): Promise<void> {
    // In production, would update database
    console.log(`[AlertManager] Alert ${alertId} resolved by ${userId}`)
  }

  /**
   * Get active alerts
   */
  static async getActiveAlerts(
    tenantId: string,
    category?: AlertCategory,
    severity?: AlertSeverity
  ): Promise<Alert[]> {
    const where: any = {
      tenantId,
      action: 'ALERT_CREATED',
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    return logs.map(log => {
      const metadata = JSON.parse(log.metadata as string || '{}')
      return {
        id: log.resourceId,
        tenantId: log.tenantId,
        category: metadata.category,
        severity: metadata.severity,
        title: metadata.title,
        message: metadata.message,
        metadata: metadata,
        createdAt: log.timestamp,
      }
    }).filter(alert => {
      if (category && alert.category !== category) return false
      if (severity && alert.severity !== severity) return false
      return true
    })
  }

  /**
   * Evaluate rules and create alerts
   */
  static async evaluateRules(tenantId: string, context: any): Promise<Alert[]> {
    const alerts: Alert[] = []

    for (const rule of this.rules) {
      try {
        if (rule.condition(context)) {
          // Check cooldown
          const recentAlerts = await this.getActiveAlerts(tenantId, rule.category)
          const lastAlert = recentAlerts.find(a => a.title === rule.name)
          
          if (lastAlert) {
            const cooldownMs = rule.cooldownMinutes * 60 * 1000
            const timeSinceLastAlert = Date.now() - lastAlert.createdAt.getTime()
            
            if (timeSinceLastAlert < cooldownMs) {
              continue // Skip due to cooldown
            }
          }

          const alert = await this.createAlert(
            tenantId,
            rule.category,
            rule.severity,
            rule.name,
            rule.message,
            context
          )

          alerts.push(alert)
        }
      } catch (error) {
        console.error(`[AlertManager] Error evaluating rule ${rule.name}:`, error)
      }
    }

    return alerts
  }

  /**
   * Get alert statistics
   */
  static async getAlertStats(
    tenantId: string,
    days: number = 7
  ): Promise<{
    total: number
    byCategory: Record<AlertCategory, number>
    bySeverity: Record<AlertSeverity, number>
    timeline: Array<{ date: string; count: number }>
  }> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const alerts = await this.getActiveAlerts(tenantId)
    const recentAlerts = alerts.filter(a => a.createdAt >= startDate)

    const byCategory: Record<AlertCategory, number> = {
      SECURITY: 0,
      PERFORMANCE: 0,
      QUOTA: 0,
      HEALTH: 0,
      COMPLIANCE: 0,
      BILLING: 0,
    }

    const bySeverity: Record<AlertSeverity, number> = {
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
      CRITICAL: 0,
    }

    const timelineCounts: Record<string, number> = {}

    for (const alert of recentAlerts) {
      byCategory[alert.category]++
      bySeverity[alert.severity]++

      const dateKey = alert.createdAt.toISOString().split('T')[0]
      timelineCounts[dateKey] = (timelineCounts[dateKey] || 0) + 1
    }

    const timeline = Object.entries(timelineCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      total: recentAlerts.length,
      byCategory,
      bySeverity,
      timeline,
    }
  }

  /**
   * Register default rules
   */
  static registerDefaultRules(): void {
    // High error rate
    this.registerRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      category: 'PERFORMANCE',
      severity: 'WARNING',
      message: 'Error rate exceeds 10%',
      cooldownMinutes: 60,
      condition: (ctx) => ctx.errorRate > 10,
    })

    // Database slow
    this.registerRule({
      id: 'database_slow',
      name: 'Database Performance Degraded',
      category: 'HEALTH',
      severity: 'WARNING',
      message: 'Database response time exceeds threshold',
      cooldownMinutes: 30,
      condition: (ctx) => ctx.dbResponseTime > 1000,
    })

    // Quota exceeded
    this.registerRule({
      id: 'quota_exceeded',
      name: 'Quota Exceeded',
      category: 'QUOTA',
      severity: 'ERROR',
      message: 'Tenant has exceeded their quota',
      cooldownMinutes: 120,
      condition: (ctx) => ctx.quotaUsage > 100,
    })

    // Security: Failed logins
    this.registerRule({
      id: 'failed_logins',
      name: 'Multiple Failed Login Attempts',
      category: 'SECURITY',
      severity: 'CRITICAL',
      message: 'Suspicious login activity detected',
      cooldownMinutes: 15,
      condition: (ctx) => ctx.failedLogins > 10,
    })

    // Compliance: Unverified consent
    this.registerRule({
      id: 'unverified_consent',
      name: 'Unverified Consent Records',
      category: 'COMPLIANCE',
      severity: 'WARNING',
      message: 'Dataset contains unverified consent records',
      cooldownMinutes: 1440, // 24 hours
      condition: (ctx) => ctx.unverifiedConsentCount > 100,
    })

    // Billing: Payment failed
    this.registerRule({
      id: 'payment_failed',
      name: 'Payment Failed',
      category: 'BILLING',
      severity: 'CRITICAL',
      message: 'Payment processing failed',
      cooldownMinutes: 60,
      condition: (ctx) => ctx.paymentFailed === true,
    })
  }

  /**
   * Clear old alerts
   */
  static async clearOldAlerts(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    // In production, would delete from database
    return 0
  }

  /**
   * Export alerts
   */
  static async exportAlerts(
    tenantId: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const alerts = await this.getActiveAlerts(tenantId)

    if (format === 'json') {
      return JSON.stringify(alerts, null, 2)
    }

    // CSV format
    const headers = ['id', 'category', 'severity', 'title', 'message', 'createdAt']
    const rows = alerts.map(alert => [
      alert.id,
      alert.category,
      alert.severity,
      alert.title,
      alert.message,
      alert.createdAt.toISOString(),
    ])

    return [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n')
  }
}

// Initialize default rules
AlertManager.registerDefaultRules()
