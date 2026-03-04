/**
 * FEATURE MANAGER
 * Advanced feature flag management with targeting and rollout
 */

import { redis } from '@/lib/redis'

export interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  rolloutPercentage: number
  targetTenants?: string[]
  targetUsers?: string[]
  conditions?: FeatureCondition[]
  createdAt: Date
  updatedAt: Date
}

export interface FeatureCondition {
  type: 'TENANT_TIER' | 'USER_ROLE' | 'DATE_RANGE' | 'CUSTOM'
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN'
  value: any
}

export interface FeatureEvaluation {
  enabled: boolean
  reason: string
  variant?: string
}

export class FeatureManager {
  private static readonly CACHE_PREFIX = 'feature:'
  private static readonly CACHE_TTL = 300 // 5 minutes
  private static flags: Map<string, FeatureFlag> = new Map()

  /**
   * Register feature flag
   */
  static registerFlag(flag: FeatureFlag): void {
    this.flags.set(flag.id, flag)
  }

  /**
   * Check if feature is enabled
   */
  static async isEnabled(
    featureId: string,
    context: {
      tenantId?: string
      userId?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<boolean> {
    const evaluation = await this.evaluate(featureId, context)
    return evaluation.enabled
  }

  /**
   * Evaluate feature flag
   */
  static async evaluate(
    featureId: string,
    context: {
      tenantId?: string
      userId?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<FeatureEvaluation> {
    // Check cache
    const cacheKey = this.getCacheKey(featureId, context)
    const cached = await this.getFromCache(cacheKey)
    if (cached) {
      return cached
    }

    const flag = this.flags.get(featureId)
    if (!flag) {
      return { enabled: false, reason: 'Feature not found' }
    }

    // Global disable
    if (!flag.enabled) {
      return { enabled: false, reason: 'Feature globally disabled' }
    }

    // Target tenants
    if (flag.targetTenants && flag.targetTenants.length > 0) {
      if (!context.tenantId || !flag.targetTenants.includes(context.tenantId)) {
        return { enabled: false, reason: 'Tenant not targeted' }
      }
    }

    // Target users
    if (flag.targetUsers && flag.targetUsers.length > 0) {
      if (!context.userId || !flag.targetUsers.includes(context.userId)) {
        return { enabled: false, reason: 'User not targeted' }
      }
    }

    // Evaluate conditions
    if (flag.conditions && flag.conditions.length > 0) {
      for (const condition of flag.conditions) {
        if (!this.evaluateCondition(condition, context)) {
          return { enabled: false, reason: `Condition not met: ${condition.type}` }
        }
      }
    }

    // Rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(featureId, context)
      const percentage = hash % 100
      
      if (percentage >= flag.rolloutPercentage) {
        return { enabled: false, reason: `Outside rollout percentage (${flag.rolloutPercentage}%)` }
      }
    }

    const result = { enabled: true, reason: 'All checks passed' }
    await this.setCache(cacheKey, result)
    return result
  }

  /**
   * Evaluate condition
   */
  private static evaluateCondition(
    condition: FeatureCondition,
    context: { metadata?: Record<string, any> }
  ): boolean {
    const value = context.metadata?.[condition.type.toLowerCase()]

    switch (condition.operator) {
      case 'EQUALS':
        return value === condition.value
      case 'NOT_EQUALS':
        return value !== condition.value
      case 'IN':
        return Array.isArray(condition.value) && condition.value.includes(value)
      case 'NOT_IN':
        return Array.isArray(condition.value) && !condition.value.includes(value)
      case 'GREATER_THAN':
        return value > condition.value
      case 'LESS_THAN':
        return value < condition.value
      default:
        return false
    }
  }

  /**
   * Hash context for consistent rollout
   */
  private static hashContext(
    featureId: string,
    context: { tenantId?: string; userId?: string }
  ): number {
    const str = `${featureId}:${context.tenantId || ''}:${context.userId || ''}`
    let hash = 0
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    
    return Math.abs(hash)
  }

  /**
   * Get all enabled features for context
   */
  static async getEnabledFeatures(context: {
    tenantId?: string
    userId?: string
    metadata?: Record<string, any>
  }): Promise<string[]> {
    const enabled: string[] = []

    for (const [featureId] of this.flags) {
      if (await this.isEnabled(featureId, context)) {
        enabled.push(featureId)
      }
    }

    return enabled
  }

  /**
   * Update flag
   */
  static updateFlag(featureId: string, updates: Partial<FeatureFlag>): void {
    const flag = this.flags.get(featureId)
    if (flag) {
      this.flags.set(featureId, {
        ...flag,
        ...updates,
        updatedAt: new Date(),
      })
      this.invalidateCache(featureId)
    }
  }

  /**
   * Enable feature
   */
  static enableFeature(featureId: string): void {
    this.updateFlag(featureId, { enabled: true })
  }

  /**
   * Disable feature
   */
  static disableFeature(featureId: string): void {
    this.updateFlag(featureId, { enabled: false })
  }

  /**
   * Set rollout percentage
   */
  static setRollout(featureId: string, percentage: number): void {
    this.updateFlag(featureId, { rolloutPercentage: Math.max(0, Math.min(100, percentage)) })
  }

  /**
   * Add target tenant
   */
  static addTargetTenant(featureId: string, tenantId: string): void {
    const flag = this.flags.get(featureId)
    if (flag) {
      const targetTenants = flag.targetTenants || []
      if (!targetTenants.includes(tenantId)) {
        this.updateFlag(featureId, {
          targetTenants: [...targetTenants, tenantId],
        })
      }
    }
  }

  /**
   * Remove target tenant
   */
  static removeTargetTenant(featureId: string, tenantId: string): void {
    const flag = this.flags.get(featureId)
    if (flag && flag.targetTenants) {
      this.updateFlag(featureId, {
        targetTenants: flag.targetTenants.filter(id => id !== tenantId),
      })
    }
  }

  /**
   * Get flag details
   */
  static getFlag(featureId: string): FeatureFlag | undefined {
    return this.flags.get(featureId)
  }

  /**
   * List all flags
   */
  static listFlags(): FeatureFlag[] {
    return Array.from(this.flags.values())
  }

  /**
   * Cache helpers
   */
  private static getCacheKey(
    featureId: string,
    context: { tenantId?: string; userId?: string }
  ): string {
    return `${this.CACHE_PREFIX}${featureId}:${context.tenantId || 'none'}:${context.userId || 'none'}`
  }

  private static async getFromCache(key: string): Promise<FeatureEvaluation | null> {
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  private static async setCache(key: string, value: FeatureEvaluation): Promise<void> {
    try {
      await redis.setex(key, this.CACHE_TTL, JSON.stringify(value))
    } catch (error) {
      console.error('[FeatureManager] Cache set error:', error)
    }
  }

  private static async invalidateCache(featureId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${featureId}:*`
      const keys = await redis.keys(pattern)
      
      for (const key of keys) {
        await redis.del(key)
      }
    } catch (error) {
      console.error('[FeatureManager] Cache invalidation error:', error)
    }
  }

  /**
   * Register default features
   */
  static registerDefaultFeatures(): void {
    this.registerFlag({
      id: 'advanced_analytics',
      name: 'Advanced Analytics',
      description: 'Enable advanced analytics dashboard',
      enabled: true,
      rolloutPercentage: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    this.registerFlag({
      id: 'ai_powered_search',
      name: 'AI-Powered Search',
      description: 'Enable AI-powered semantic search',
      enabled: true,
      rolloutPercentage: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    this.registerFlag({
      id: 'real_time_collaboration',
      name: 'Real-time Collaboration',
      description: 'Enable real-time collaboration features',
      enabled: false,
      rolloutPercentage: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    this.registerFlag({
      id: 'export_to_parquet',
      name: 'Export to Parquet',
      description: 'Enable Parquet export format',
      enabled: true,
      rolloutPercentage: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  /**
   * Get feature statistics
   */
  static getStatistics(): {
    total: number
    enabled: number
    disabled: number
    partialRollout: number
  } {
    const flags = this.listFlags()
    
    return {
      total: flags.length,
      enabled: flags.filter(f => f.enabled).length,
      disabled: flags.filter(f => !f.enabled).length,
      partialRollout: flags.filter(f => f.enabled && f.rolloutPercentage < 100).length,
    }
  }
}

// Initialize default features
FeatureManager.registerDefaultFeatures()
