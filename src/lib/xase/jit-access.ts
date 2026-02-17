/**
 * JIT (JUST-IN-TIME) ACCESS
 * 
 * Temporary access provisioning with automatic expiration
 * Implements principle of least privilege
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { insertAuditEvent } from './clickhouse-client'

export interface JITAccessRequest {
  userId: string
  tenantId: string
  resourceType: 'DATASET' | 'POLICY' | 'LEASE' | 'ADMIN'
  resourceId: string
  permissions: string[]
  reason: string
  duration: number // seconds
  approver?: string
  requiresApproval: boolean
}

export interface JITAccessGrant {
  grantId: string
  userId: string
  tenantId: string
  resourceType: string
  resourceId: string
  permissions: string[]
  grantedAt: Date
  expiresAt: Date
  grantedBy: string
  reason: string
  revoked: boolean
}

export interface JITAccessCheck {
  allowed: boolean
  grant?: JITAccessGrant
  reason?: string
}

/**
 * JIT Access Manager
 */
export class JITAccessManager {
  private static readonly REDIS_PREFIX = 'jit:access:'
  private static readonly MAX_DURATION = 86400 // 24 hours
  private static readonly DEFAULT_DURATION = 3600 // 1 hour

  /**
   * Request JIT access
   */
  static async requestAccess(request: JITAccessRequest): Promise<JITAccessGrant> {
    // Validate duration
    const duration = Math.min(request.duration, this.MAX_DURATION)

    const grantId = `jit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + duration * 1000)

    const grant: JITAccessGrant = {
      grantId,
      userId: request.userId,
      tenantId: request.tenantId,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      permissions: request.permissions,
      grantedAt: now,
      expiresAt,
      grantedBy: request.approver || 'system',
      reason: request.reason,
      revoked: false,
    }

    // Store in Redis with TTL
    await redis.setex(
      `${this.REDIS_PREFIX}${grantId}`,
      duration,
      JSON.stringify(grant)
    )

    // Store in database for audit
    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        action: 'JIT_ACCESS_GRANTED',
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          grantId,
          permissions: request.permissions,
          duration,
          reason: request.reason,
          approver: request.approver,
        }),
        timestamp: now,
      },
    })

    // Log to ClickHouse
    await insertAuditEvent({
      event_id: grantId,
      tenant_id: request.tenantId,
      event_type: 'JIT_ACCESS',
      resource_type: request.resourceType,
      resource_id: request.resourceId,
      actor_id: request.userId,
      actor_type: 'USER',
      action: 'GRANT',
      outcome: 'SUCCESS',
      ip_address: 'system',
      user_agent: 'jit-access-manager',
      metadata: JSON.stringify({
        permissions: request.permissions,
        duration,
        expiresAt: expiresAt.toISOString(),
      }),
      event_timestamp: now,
    }).catch(err => console.error('[JIT] Failed to log to ClickHouse:', err))

    return grant
  }

  /**
   * Check if user has JIT access
   */
  static async checkAccess(
    userId: string,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    permission: string
  ): Promise<JITAccessCheck> {
    // Find active grants for user
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)

    for (const key of keys) {
      const data = await redis.get(key)
      if (!data) continue

      const grant: JITAccessGrant = JSON.parse(data)

      // Check if grant matches
      if (
        grant.userId === userId &&
        grant.tenantId === tenantId &&
        grant.resourceType === resourceType &&
        grant.resourceId === resourceId &&
        !grant.revoked &&
        grant.permissions.includes(permission)
      ) {
        // Check if expired
        if (new Date() > new Date(grant.expiresAt)) {
          await this.revokeAccess(grant.grantId, 'EXPIRED')
          continue
        }

        return { allowed: true, grant }
      }
    }

    return { allowed: false, reason: 'No active JIT grant found' }
  }

  /**
   * Revoke JIT access
   */
  static async revokeAccess(grantId: string, reason: string = 'MANUAL_REVOCATION'): Promise<void> {
    const key = `${this.REDIS_PREFIX}${grantId}`
    const data = await redis.get(key)

    if (!data) {
      throw new Error('Grant not found')
    }

    const grant: JITAccessGrant = JSON.parse(data)

    // Mark as revoked
    grant.revoked = true
    await redis.setex(key, 60, JSON.stringify(grant)) // Keep for 1 minute for audit

    // Log revocation
    await prisma.auditLog.create({
      data: {
        tenantId: grant.tenantId,
        userId: grant.userId,
        action: 'JIT_ACCESS_REVOKED',
        resourceType: grant.resourceType,
        resourceId: grant.resourceId,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          grantId,
          reason,
        }),
        timestamp: new Date(),
      },
    })

    // Log to ClickHouse
    await insertAuditEvent({
      event_id: `${grantId}_revoke`,
      tenant_id: grant.tenantId,
      event_type: 'JIT_ACCESS',
      resource_type: grant.resourceType,
      resource_id: grant.resourceId,
      actor_id: grant.userId,
      actor_type: 'USER',
      action: 'REVOKE',
      outcome: 'SUCCESS',
      ip_address: 'system',
      user_agent: 'jit-access-manager',
      metadata: JSON.stringify({ reason }),
      event_timestamp: new Date(),
    }).catch(err => console.error('[JIT] Failed to log revocation:', err))
  }

  /**
   * List active grants for user
   */
  static async listUserGrants(userId: string, tenantId: string): Promise<JITAccessGrant[]> {
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)
    const grants: JITAccessGrant[] = []

    for (const key of keys) {
      const data = await redis.get(key)
      if (!data) continue

      const grant: JITAccessGrant = JSON.parse(data)

      if (grant.userId === userId && grant.tenantId === tenantId && !grant.revoked) {
        // Check if expired
        if (new Date() > new Date(grant.expiresAt)) {
          await this.revokeAccess(grant.grantId, 'EXPIRED')
          continue
        }

        grants.push(grant)
      }
    }

    return grants
  }

  /**
   * Extend JIT access duration
   */
  static async extendAccess(grantId: string, additionalSeconds: number): Promise<JITAccessGrant> {
    const key = `${this.REDIS_PREFIX}${grantId}`
    const data = await redis.get(key)

    if (!data) {
      throw new Error('Grant not found')
    }

    const grant: JITAccessGrant = JSON.parse(data)

    if (grant.revoked) {
      throw new Error('Grant is revoked')
    }

    // Calculate new expiration
    const currentTTL = await redis.ttl(key)
    const newTTL = Math.min(currentTTL + additionalSeconds, this.MAX_DURATION)
    const newExpiresAt = new Date(Date.now() + newTTL * 1000)

    grant.expiresAt = newExpiresAt

    // Update Redis
    await redis.setex(key, newTTL, JSON.stringify(grant))

    // Log extension
    await prisma.auditLog.create({
      data: {
        tenantId: grant.tenantId,
        userId: grant.userId,
        action: 'JIT_ACCESS_EXTENDED',
        resourceType: grant.resourceType,
        resourceId: grant.resourceId,
        status: 'SUCCESS',
        metadata: JSON.stringify({
          grantId,
          additionalSeconds,
          newExpiresAt: newExpiresAt.toISOString(),
        }),
        timestamp: new Date(),
      },
    })

    return grant
  }

  /**
   * Cleanup expired grants (background job)
   */
  static async cleanupExpiredGrants(): Promise<number> {
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)
    let cleaned = 0

    for (const key of keys) {
      const ttl = await redis.ttl(key)
      if (ttl <= 0) {
        await redis.del(key)
        cleaned++
      }
    }

    return cleaned
  }
}
