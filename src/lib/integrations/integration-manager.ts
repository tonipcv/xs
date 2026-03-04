/**
 * INTEGRATION MANAGER
 * Manage external service integrations
 */

export interface Integration {
  id: string
  name: string
  type: 'DATABASE' | 'STORAGE' | 'API' | 'ANALYTICS' | 'MESSAGING'
  enabled: boolean
  config: Record<string, any>
  healthCheck?: () => Promise<boolean>
  connect?: () => Promise<void>
  disconnect?: () => Promise<void>
}

export interface IntegrationStatus {
  id: string
  name: string
  enabled: boolean
  healthy: boolean
  lastCheck: Date
  error?: string
}

export class IntegrationManager {
  private static integrations: Map<string, Integration> = new Map()
  private static statuses: Map<string, IntegrationStatus> = new Map()

  /**
   * Register integration
   */
  static register(integration: Integration): void {
    this.integrations.set(integration.id, integration)
    this.statuses.set(integration.id, {
      id: integration.id,
      name: integration.name,
      enabled: integration.enabled,
      healthy: false,
      lastCheck: new Date(),
    })
  }

  /**
   * Get integration
   */
  static get(id: string): Integration | undefined {
    return this.integrations.get(id)
  }

  /**
   * List all integrations
   */
  static list(): Integration[] {
    return Array.from(this.integrations.values())
  }

  /**
   * Enable integration
   */
  static async enable(id: string): Promise<void> {
    const integration = this.integrations.get(id)
    if (!integration) {
      throw new Error(`Integration ${id} not found`)
    }

    integration.enabled = true

    if (integration.connect) {
      await integration.connect()
    }

    const status = this.statuses.get(id)
    if (status) {
      status.enabled = true
    }
  }

  /**
   * Disable integration
   */
  static async disable(id: string): Promise<void> {
    const integration = this.integrations.get(id)
    if (!integration) {
      throw new Error(`Integration ${id} not found`)
    }

    integration.enabled = false

    if (integration.disconnect) {
      await integration.disconnect()
    }

    const status = this.statuses.get(id)
    if (status) {
      status.enabled = false
    }
  }

  /**
   * Check health of integration
   */
  static async checkHealth(id: string): Promise<boolean> {
    const integration = this.integrations.get(id)
    if (!integration || !integration.enabled) {
      return false
    }

    const status = this.statuses.get(id)
    if (!status) return false

    try {
      const healthy = integration.healthCheck
        ? await integration.healthCheck()
        : true

      status.healthy = healthy
      status.lastCheck = new Date()
      status.error = undefined

      return healthy
    } catch (error) {
      status.healthy = false
      status.lastCheck = new Date()
      status.error = error instanceof Error ? error.message : String(error)

      return false
    }
  }

  /**
   * Check health of all integrations
   */
  static async checkAllHealth(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [id] of this.integrations) {
      const healthy = await this.checkHealth(id)
      results.set(id, healthy)
    }

    return results
  }

  /**
   * Get status of integration
   */
  static getStatus(id: string): IntegrationStatus | undefined {
    return this.statuses.get(id)
  }

  /**
   * Get all statuses
   */
  static getAllStatuses(): IntegrationStatus[] {
    return Array.from(this.statuses.values())
  }

  /**
   * Update integration config
   */
  static updateConfig(id: string, config: Record<string, any>): void {
    const integration = this.integrations.get(id)
    if (!integration) {
      throw new Error(`Integration ${id} not found`)
    }

    integration.config = { ...integration.config, ...config }
  }

  /**
   * Register default integrations
   */
  static registerDefaultIntegrations(): void {
    this.register({
      id: 'postgres',
      name: 'PostgreSQL Database',
      type: 'DATABASE',
      enabled: true,
      config: {},
      healthCheck: async () => {
        try {
          const { prisma } = await import('@/lib/prisma')
          await prisma.$queryRaw`SELECT 1`
          return true
        } catch {
          return false
        }
      },
    })

    this.register({
      id: 'redis',
      name: 'Redis Cache',
      type: 'DATABASE',
      enabled: true,
      config: {},
      healthCheck: async () => {
        try {
          const { redis } = await import('@/lib/redis')
          await redis.get('health_check')
          return true
        } catch {
          return false
        }
      },
    })

    this.register({
      id: 's3',
      name: 'AWS S3 Storage',
      type: 'STORAGE',
      enabled: false,
      config: {
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION,
      },
    })

    this.register({
      id: 'stripe',
      name: 'Stripe Payments',
      type: 'API',
      enabled: false,
      config: {
        apiKey: process.env.STRIPE_SECRET_KEY,
      },
    })

    this.register({
      id: 'sendgrid',
      name: 'SendGrid Email',
      type: 'MESSAGING',
      enabled: false,
      config: {
        apiKey: process.env.SENDGRID_API_KEY,
      },
    })
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    total: number
    enabled: number
    healthy: number
    unhealthy: number
    byType: Record<string, number>
  } {
    const integrations = this.list()
    const statuses = this.getAllStatuses()

    const byType: Record<string, number> = {}

    for (const integration of integrations) {
      byType[integration.type] = (byType[integration.type] || 0) + 1
    }

    return {
      total: integrations.length,
      enabled: integrations.filter(i => i.enabled).length,
      healthy: statuses.filter(s => s.healthy).length,
      unhealthy: statuses.filter(s => s.enabled && !s.healthy).length,
      byType,
    }
  }
}

// Initialize default integrations
IntegrationManager.registerDefaultIntegrations()
