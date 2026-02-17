/**
 * API Key Manager - Enhanced with scopes and rotation
 */

import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export interface ApiKeyScope {
  resource: 'datasets' | 'policies' | 'leases' | 'all'
  resourceIds?: string[]
  permissions: string[]
}

export interface ApiKeyWithScopes {
  id: string
  tenantId: string
  name: string
  keyPrefix: string
  scopes: ApiKeyScope[]
  isActive: boolean
  expiresAt?: Date
  lastUsedAt?: Date
  createdAt: Date
  rotationSchedule?: 'never' | 'monthly' | 'quarterly' | 'yearly'
}

export class ApiKeyManager {
  /**
   * Create API key with scopes
   */
  static async createKey(
    tenantId: string,
    name: string,
    scopes: ApiKeyScope[],
    expiresInDays?: number
  ): Promise<{ key: string; apiKey: ApiKeyWithScopes }> {
    const rawKey = crypto.randomBytes(32).toString('hex')
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = `xase_${rawKey.substring(0, 8)}`

    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        keyPrefix,
        isActive: true,
        permissions: scopes.map(s => s.permissions.join(',')).join(';'),
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'API_KEY_CREATED',
        resourceType: 'api_key',
        resourceId: apiKey.id,
        metadata: JSON.stringify({ name, scopes }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {})

    return {
      key: `${keyPrefix}_${rawKey}`,
      apiKey: {
        id: apiKey.id,
        tenantId: apiKey.tenantId,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes,
        isActive: apiKey.isActive,
        expiresAt,
        createdAt: apiKey.createdAt,
      },
    }
  }

  /**
   * Rotate API key
   */
  static async rotateKey(keyId: string): Promise<{ key: string; apiKey: ApiKeyWithScopes }> {
    const existingKey = await prisma.apiKey.findUnique({
      where: { id: keyId },
    })

    if (!existingKey) {
      throw new Error('API key not found')
    }

    // Deactivate old key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    })

    // Create new key with same scopes
    const rawKey = crypto.randomBytes(32).toString('hex')
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = `xase_${rawKey.substring(0, 8)}`

    const newKey = await prisma.apiKey.create({
      data: {
        tenantId: existingKey.tenantId,
        name: `${existingKey.name} (rotated)`,
        keyHash,
        keyPrefix,
        isActive: true,
        permissions: existingKey.permissions,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: existingKey.tenantId,
        action: 'API_KEY_ROTATED',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: JSON.stringify({ newKeyId: newKey.id }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {})

    return {
      key: `${keyPrefix}_${rawKey}`,
      apiKey: {
        id: newKey.id,
        tenantId: newKey.tenantId,
        name: newKey.name,
        keyPrefix: newKey.keyPrefix,
        scopes: this.parseScopes(newKey.permissions),
        isActive: newKey.isActive,
        createdAt: newKey.createdAt,
      },
    }
  }

  /**
   * Revoke API key
   */
  static async revokeKey(keyId: string): Promise<void> {
    const apiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: apiKey.tenantId,
        action: 'API_KEY_REVOKED',
        resourceType: 'api_key',
        resourceId: keyId,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {})
  }

  /**
   * Validate API key and check scopes
   */
  static async validateKeyWithScope(
    key: string,
    resource: string,
    resourceId: string,
    permission: string
  ): Promise<{ valid: boolean; tenantId?: string; apiKeyId?: string }> {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
    })

    if (!apiKey || !apiKey.isActive) {
      return { valid: false }
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })

    // Check scopes
    const scopes = this.parseScopes(apiKey.permissions)
    const hasAccess = this.checkScopeAccess(scopes, resource, resourceId, permission)

    return {
      valid: hasAccess,
      tenantId: apiKey.tenantId,
      apiKeyId: apiKey.id,
    }
  }

  /**
   * Parse scopes from permissions string
   */
  private static parseScopes(permissions: string): ApiKeyScope[] {
    if (!permissions) return []

    const scopeStrings = permissions.split(';')
    return scopeStrings.map(s => {
      const perms = s.split(',')
      return {
        resource: 'all' as const,
        permissions: perms,
      }
    })
  }

  /**
   * Check scope access
   */
  private static checkScopeAccess(
    scopes: ApiKeyScope[],
    resource: string,
    resourceId: string,
    permission: string
  ): boolean {
    for (const scope of scopes) {
      if (scope.resource === 'all' || scope.resource === resource) {
        if (scope.permissions.includes(permission) || scope.permissions.includes('*')) {
          if (!scope.resourceIds || scope.resourceIds.includes(resourceId)) {
            return true
          }
        }
      }
    }
    return false
  }

  /**
   * List API keys for tenant
   */
  static async listKeys(tenantId: string): Promise<ApiKeyWithScopes[]> {
    const keys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })

    return keys.map(key => ({
      id: key.id,
      tenantId: key.tenantId,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: this.parseScopes(key.permissions),
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt || undefined,
      createdAt: key.createdAt,
    }))
  }

  /**
   * Get API key usage stats
   */
  static async getKeyUsageStats(keyId: string): Promise<{
    totalRequests: number
    last24h: number
    last7d: number
    last30d: number
  }> {
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'api_key',
        resourceId: keyId,
      },
    })

    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const last24h = logs.filter(l => now - l.timestamp.getTime() < day).length
    const last7d = logs.filter(l => now - l.timestamp.getTime() < 7 * day).length
    const last30d = logs.filter(l => now - l.timestamp.getTime() < 30 * day).length

    return {
      totalRequests: logs.length,
      last24h,
      last7d,
      last30d,
    }
  }

  /**
   * Schedule key rotation
   */
  static async scheduleRotation(
    keyId: string,
    schedule: 'never' | 'monthly' | 'quarterly' | 'yearly'
  ): Promise<void> {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: keyId },
      select: { tenantId: true },
    });
    
    if (apiKey) {
      await prisma.auditLog.create({
        data: {
          tenantId: apiKey.tenantId,
          action: 'API_KEY_ROTATION_SCHEDULED',
          resourceType: 'api_key',
          resourceId: keyId,
          metadata: JSON.stringify({ schedule }),
          status: 'SUCCESS',
          timestamp: new Date(),
        },
      }).catch(() => {});
    }
  }
}
