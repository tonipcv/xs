/**
 * CACHE WARMER
 * Preload and warm cache for better performance
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export interface WarmupTask {
  id: string
  name: string
  priority: number
  execute: () => Promise<void>
  schedule?: string // cron expression
}

export class CacheWarmer {
  private static tasks: WarmupTask[] = []
  private static running = false

  /**
   * Register warmup task
   */
  static registerTask(task: WarmupTask): void {
    this.tasks.push(task)
    this.tasks.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Execute all warmup tasks
   */
  static async warmup(): Promise<{
    completed: number
    failed: number
    duration: number
  }> {
    if (this.running) {
      throw new Error('Warmup already running')
    }

    this.running = true
    const startTime = Date.now()
    let completed = 0
    let failed = 0

    try {
      for (const task of this.tasks) {
        try {
          await task.execute()
          completed++
        } catch (error) {
          console.error(`[CacheWarmer] Task ${task.name} failed:`, error)
          failed++
        }
      }
    } finally {
      this.running = false
    }

    return {
      completed,
      failed,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Warm specific task
   */
  static async warmTask(taskId: string): Promise<void> {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    await task.execute()
  }

  /**
   * Get registered tasks
   */
  static getTasks(): WarmupTask[] {
    return [...this.tasks]
  }

  /**
   * Clear all tasks
   */
  static clearTasks(): void {
    this.tasks = []
  }

  /**
   * Register default warmup tasks
   */
  static registerDefaultTasks(): void {
    // Warm popular datasets
    this.registerTask({
      id: 'warm_popular_datasets',
      name: 'Warm Popular Datasets',
      priority: 100,
      execute: async () => {
        const datasets = await prisma.dataset.findMany({
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, tenantId: true },
        })

        for (const dataset of datasets) {
          const cacheKey = `dataset:${dataset.id}`
          await redis.setex(cacheKey, 3600, JSON.stringify(dataset))
        }
      },
    })

    // Warm tenant configs
    this.registerTask({
      id: 'warm_tenant_configs',
      name: 'Warm Tenant Configs',
      priority: 90,
      execute: async () => {
        const tenants = await prisma.tenant.findMany({
          take: 100,
          select: { id: true, name: true, plan: true },
        })

        for (const tenant of tenants) {
          const cacheKey = `tenant:${tenant.id}`
          await redis.setex(cacheKey, 3600, JSON.stringify(tenant))
        }
      },
    })

    // Warm API keys
    this.registerTask({
      id: 'warm_api_keys',
      name: 'Warm API Keys',
      priority: 80,
      execute: async () => {
        const keys = await prisma.apiKey.findMany({
          where: { revokedAt: null },
          take: 200,
          select: { id: true, keyHash: true, tenantId: true },
        })

        for (const key of keys) {
          const cacheKey = `apikey:${key.keyHash}`
          await redis.setex(cacheKey, 1800, JSON.stringify(key))
        }
      },
    })

    // Warm rate limit configs
    this.registerTask({
      id: 'warm_rate_limits',
      name: 'Warm Rate Limit Configs',
      priority: 70,
      execute: async () => {
        const configs = {
          default: { points: 100, duration: 60 },
          premium: { points: 1000, duration: 60 },
          enterprise: { points: 10000, duration: 60 },
        }

        for (const [plan, config] of Object.entries(configs)) {
          const cacheKey = `ratelimit:config:${plan}`
          await redis.setex(cacheKey, 7200, JSON.stringify(config))
        }
      },
    })
  }

  /**
   * Schedule periodic warmup
   */
  static scheduleWarmup(intervalMs: number = 3600000): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        await this.warmup()
      } catch (error) {
        console.error('[CacheWarmer] Scheduled warmup failed:', error)
      }
    }, intervalMs)
  }

  /**
   * Get warmup statistics
   */
  static getStatistics(): {
    totalTasks: number
    isRunning: boolean
    tasksByPriority: Record<number, number>
  } {
    const tasksByPriority: Record<number, number> = {}

    for (const task of this.tasks) {
      tasksByPriority[task.priority] = (tasksByPriority[task.priority] || 0) + 1
    }

    return {
      totalTasks: this.tasks.length,
      isRunning: this.running,
      tasksByPriority,
    }
  }
}

// Initialize default tasks
CacheWarmer.registerDefaultTasks()
