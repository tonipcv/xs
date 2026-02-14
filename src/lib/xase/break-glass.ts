// @ts-nocheck
/**
 * BREAK-GLASS ACCESS
 * 
 * Emergency access mechanism with full audit trail
 * Used for critical incidents requiring immediate access
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { insertAuditEvent } from './clickhouse-client'

export interface BreakGlassRequest {
  userId: string
  tenantId: string
  resourceType: 'DATASET' | 'POLICY' | 'SYSTEM' | 'ALL'
  resourceId: string
  reason: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  incidentId?: string
  ipAddress: string
  userAgent: string
}

export interface BreakGlassSession {
  sessionId: string
  userId: string
  tenantId: string
  resourceType: string
  resourceId: string
  reason: string
  severity: string
  incidentId?: string
  activatedAt: Date
  expiresAt: Date
  terminatedAt?: Date
  ipAddress: string
  userAgent: string
  actionsPerformed: BreakGlassAction[]
}

export interface BreakGlassAction {
  actionId: string
  action: string
  resourceType: string
  resourceId: string
  timestamp: Date
  outcome: 'SUCCESS' | 'FAILURE'
  details: string
}

/**
 * Break-Glass Access Manager
 */
export class BreakGlassManager {
  private static readonly REDIS_PREFIX = 'breakglass:session:'
  private static readonly SESSION_DURATION = 3600 // 1 hour
  private static readonly ALERT_WEBHOOK = process.env.BREAKGLASS_ALERT_WEBHOOK

  /**
   * Activate break-glass access
   */
  static async activate(request: BreakGlassRequest): Promise<BreakGlassSession> {
    const sessionId = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION * 1000)

    const session: BreakGlassSession = {
      sessionId,
      userId: request.userId,
      tenantId: request.tenantId,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      reason: request.reason,
      severity: request.severity,
      incidentId: request.incidentId,
      activatedAt: now,
      expiresAt,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      actionsPerformed: [],
    }

    // Store in Redis
    await redis.setex(
      `${this.REDIS_PREFIX}${sessionId}`,
      this.SESSION_DURATION,
      JSON.stringify(session)
    )

    // Store in database (permanent record)
    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        action: 'BREAK_GLASS_ACTIVATED',
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          sessionId,
          reason: request.reason,
          severity: request.severity,
          incidentId: request.incidentId,
        }),
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        timestamp: now,
      },
    })

    // Log to ClickHouse
    await insertAuditEvent({
      event_id: sessionId,
      tenant_id: request.tenantId,
      event_type: 'BREAK_GLASS',
      resource_type: request.resourceType,
      resource_id: request.resourceId,
      actor_id: request.userId,
      actor_type: 'USER',
      action: 'ACTIVATE',
      outcome: 'SUCCESS',
      ip_address: request.ipAddress,
      user_agent: request.userAgent,
      metadata: JSON.stringify({
        reason: request.reason,
        severity: request.severity,
        incidentId: request.incidentId,
      }),
      event_timestamp: now,
    }).catch(err => console.error('[BreakGlass] Failed to log:', err))

    // Send alert
    await this.sendAlert(session, 'ACTIVATED')

    return session
  }

  /**
   * Check if user has active break-glass session
   */
  static async checkSession(userId: string, tenantId: string): Promise<BreakGlassSession | null> {
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)

    for (const key of keys) {
      const data = await redis.get(key)
      if (!data) continue

      const session: BreakGlassSession = JSON.parse(data)

      if (
        session.userId === userId &&
        session.tenantId === tenantId &&
        !session.terminatedAt
      ) {
        // Check if expired
        if (new Date() > new Date(session.expiresAt)) {
          await this.terminate(session.sessionId, 'EXPIRED')
          continue
        }

        return session
      }
    }

    return null
  }

  /**
   * Log action performed during break-glass session
   */
  static async logAction(
    sessionId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: 'SUCCESS' | 'FAILURE',
    details: string
  ): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}`
    const data = await redis.get(key)

    if (!data) {
      throw new Error('Break-glass session not found')
    }

    const session: BreakGlassSession = JSON.parse(data)

    const actionRecord: BreakGlassAction = {
      actionId: `${sessionId}_${Date.now()}`,
      action,
      resourceType,
      resourceId,
      timestamp: new Date(),
      outcome,
      details,
    }

    session.actionsPerformed.push(actionRecord)

    // Update Redis
    const ttl = await redis.ttl(key)
    await redis.setex(key, ttl, JSON.stringify(session))

    // Log to database
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: `BREAK_GLASS_ACTION_${action}`,
        resourceType,
        resourceId,
        status: outcome,
        metadata: JSON.stringify({
          sessionId,
          actionId: actionRecord.actionId,
          details,
        }),
        timestamp: new Date(),
      },
    })

    // Log to ClickHouse
    await insertAuditEvent({
      event_id: actionRecord.actionId,
      tenant_id: session.tenantId,
      event_type: 'BREAK_GLASS_ACTION',
      resource_type: resourceType,
      resource_id: resourceId,
      actor_id: session.userId,
      actor_type: 'USER',
      action,
      outcome,
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
      metadata: JSON.stringify({ sessionId, details }),
      event_timestamp: new Date(),
    }).catch(err => console.error('[BreakGlass] Failed to log action:', err))
  }

  /**
   * Terminate break-glass session
   */
  static async terminate(sessionId: string, reason: string = 'MANUAL'): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}`
    const data = await redis.get(key)

    if (!data) {
      throw new Error('Session not found')
    }

    const session: BreakGlassSession = JSON.parse(data)
    session.terminatedAt = new Date()

    // Update Redis (keep for audit)
    await redis.setex(key, 300, JSON.stringify(session)) // Keep for 5 minutes

    // Log termination
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'BREAK_GLASS_TERMINATED',
        resourceType: session.resourceType,
        resourceId: session.resourceId,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          sessionId,
          reason,
          actionsPerformed: session.actionsPerformed.length,
        }),
        timestamp: new Date(),
      },
    })

    // Log to ClickHouse
    await insertAuditEvent({
      event_id: `${sessionId}_terminate`,
      tenant_id: session.tenantId,
      event_type: 'BREAK_GLASS',
      resource_type: session.resourceType,
      resource_id: session.resourceId,
      actor_id: session.userId,
      actor_type: 'USER',
      action: 'TERMINATE',
      outcome: 'SUCCESS',
      ip_address: session.ipAddress,
      user_agent: session.userAgent,
      metadata: JSON.stringify({ reason, actionsPerformed: session.actionsPerformed.length }),
      event_timestamp: new Date(),
    }).catch(err => console.error('[BreakGlass] Failed to log termination:', err))

    // Send alert
    await this.sendAlert(session, 'TERMINATED')
  }

  /**
   * Get session details
   */
  static async getSession(sessionId: string): Promise<BreakGlassSession | null> {
    const key = `${this.REDIS_PREFIX}${sessionId}`
    const data = await redis.get(key)

    if (!data) {
      return null
    }

    return JSON.parse(data)
  }

  /**
   * List all active sessions
   */
  static async listActiveSessions(tenantId?: string): Promise<BreakGlassSession[]> {
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)
    const sessions: BreakGlassSession[] = []

    for (const key of keys) {
      const data = await redis.get(key)
      if (!data) continue

      const session: BreakGlassSession = JSON.parse(data)

      if (!session.terminatedAt && (!tenantId || session.tenantId === tenantId)) {
        sessions.push(session)
      }
    }

    return sessions
  }

  /**
   * Send alert for break-glass event
   */
  private static async sendAlert(session: BreakGlassSession, event: 'ACTIVATED' | 'TERMINATED'): Promise<void> {
    if (!this.ALERT_WEBHOOK) {
      console.warn('[BreakGlass] No alert webhook configured')
      return
    }

    const message = {
      event,
      sessionId: session.sessionId,
      userId: session.userId,
      tenantId: session.tenantId,
      resourceType: session.resourceType,
      resourceId: session.resourceId,
      reason: session.reason,
      severity: session.severity,
      timestamp: event === 'ACTIVATED' ? session.activatedAt : session.terminatedAt,
      actionsPerformed: session.actionsPerformed.length,
    }

    try {
      await fetch(this.ALERT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })
    } catch (error) {
      console.error('[BreakGlass] Failed to send alert:', error)
    }
  }

  /**
   * Generate break-glass report
   */
  static async generateReport(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId)

    if (!session) {
      throw new Error('Session not found')
    }

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      tenantId: session.tenantId,
      resourceType: session.resourceType,
      resourceId: session.resourceId,
      reason: session.reason,
      severity: session.severity,
      incidentId: session.incidentId,
      activatedAt: session.activatedAt,
      expiresAt: session.expiresAt,
      terminatedAt: session.terminatedAt,
      duration: session.terminatedAt
        ? (new Date(session.terminatedAt).getTime() - new Date(session.activatedAt).getTime()) / 1000
        : null,
      actionsPerformed: session.actionsPerformed,
      totalActions: session.actionsPerformed.length,
      successfulActions: session.actionsPerformed.filter(a => a.outcome === 'SUCCESS').length,
      failedActions: session.actionsPerformed.filter(a => a.outcome === 'FAILURE').length,
    }
  }
}
