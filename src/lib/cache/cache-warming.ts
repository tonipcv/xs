/**
 * Cache Warming System
 * Automatically pre-loads frequently accessed data into cache
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

export interface CacheWarmingConfig {
  enabled: boolean;
  interval: number; // minutes
  strategies: CacheWarmingStrategy[];
}

export interface CacheWarmingStrategy {
  name: string;
  priority: number;
  ttl: number; // seconds
  execute: () => Promise<void>;
}

/**
 * Default cache warming configuration
 */
const DEFAULT_CONFIG: CacheWarmingConfig = {
  enabled: true,
  interval: 15, // 15 minutes
  strategies: [],
};

/**
 * Cache warming manager
 */
export class CacheWarmingManager {
  private config: CacheWarmingConfig;
  private intervalId?: NodeJS.Timeout;
  private isWarming: boolean = false;

  constructor(config: Partial<CacheWarmingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerDefaultStrategies();
  }

  /**
   * Register default warming strategies
   */
  private registerDefaultStrategies() {
    // Popular datasets
    this.addStrategy({
      name: 'popular-datasets',
      priority: 1,
      ttl: 3600,
      execute: async () => {
        const datasets = await prisma.dataset.findMany({
          take: 100,
          orderBy: [
            { createdAt: 'desc' },
          ],
          select: {
            id: true,
            name: true,
            dataType: true,
            size: true,
            tenantId: true,
          },
        });

        for (const dataset of datasets) {
          const key = `dataset:${dataset.id}`;
          await redis.setex(key, this.config.strategies[0].ttl, JSON.stringify(dataset));
        }

        console.log(`Warmed ${datasets.length} popular datasets`);
      },
    });

    // Active leases
    this.addStrategy({
      name: 'active-leases',
      priority: 2,
      ttl: 1800,
      execute: async () => {
        const leases = await prisma.auditLog.findMany({
          where: {
            action: 'LEASE_CREATED',
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          take: 500,
          select: {
            resourceId: true,
            metadata: true,
          },
        });

        for (const lease of leases) {
          if (lease.resourceId) {
            const key = `lease:${lease.resourceId}`;
            await redis.setex(key, 1800, JSON.stringify(lease));
          }
        }

        console.log(`Warmed ${leases.length} active leases`);
      },
    });

    // Tenant configurations
    this.addStrategy({
      name: 'tenant-configs',
      priority: 3,
      ttl: 7200,
      execute: async () => {
        const tenants = await prisma.tenant.findMany({
          select: {
            id: true,
            name: true,
            tier: true,
            settings: true,
          },
        });

        for (const tenant of tenants) {
          const key = `tenant:config:${tenant.id}`;
          await redis.setex(key, 7200, JSON.stringify(tenant));
        }

        console.log(`Warmed ${tenants.length} tenant configurations`);
      },
    });

    // User sessions
    this.addStrategy({
      name: 'user-sessions',
      priority: 4,
      ttl: 3600,
      execute: async () => {
        const sessions = await prisma.session.findMany({
          where: {
            expires: {
              gt: new Date(),
            },
          },
          take: 1000,
          select: {
            sessionToken: true,
            userId: true,
            expires: true,
          },
        });

        for (const session of sessions) {
          const key = `session:${session.sessionToken}`;
          await redis.setex(key, 3600, JSON.stringify(session));
        }

        console.log(`Warmed ${sessions.length} user sessions`);
      },
    });

    // API keys
    this.addStrategy({
      name: 'api-keys',
      priority: 5,
      ttl: 7200,
      execute: async () => {
        const apiKeys = await prisma.apiKey.findMany({
          where: {
            isActive: true,
          },
          select: {
            id: true,
            keyPrefix: true,
            tenantId: true,
            permissions: true,
          },
        });

        for (const apiKey of apiKeys) {
          const key = `apikey:${apiKey.keyPrefix}`;
          await redis.setex(key, 7200, JSON.stringify(apiKey));
        }

        console.log(`Warmed ${apiKeys.length} API keys`);
      },
    });

    // Marketplace offers
    this.addStrategy({
      name: 'marketplace-offers',
      priority: 6,
      ttl: 3600,
      execute: async () => {
        const offers = await prisma.auditLog.findMany({
          where: {
            action: 'OFFER_CREATED',
            timestamp: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
          take: 200,
          select: {
            resourceId: true,
            metadata: true,
          },
        });

        for (const offer of offers) {
          if (offer.resourceId) {
            const key = `offer:${offer.resourceId}`;
            await redis.setex(key, 3600, JSON.stringify(offer));
          }
        }

        console.log(`Warmed ${offers.length} marketplace offers`);
      },
    });

    // Usage statistics
    this.addStrategy({
      name: 'usage-stats',
      priority: 7,
      ttl: 1800,
      execute: async () => {
        const tenants = await prisma.tenant.findMany({
          select: { id: true },
        });

        for (const tenant of tenants) {
          const usageCount = await prisma.auditLog.count({
            where: {
              tenantId: tenant.id,
              action: 'USAGE_RECORDED',
              timestamp: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
          });

          const key = `usage:stats:${tenant.id}:24h`;
          await redis.setex(key, 1800, usageCount.toString());
        }

        console.log(`Warmed usage statistics for ${tenants.length} tenants`);
      },
    });
  }

  /**
   * Add custom warming strategy
   */
  public addStrategy(strategy: CacheWarmingStrategy) {
    this.config.strategies.push(strategy);
    this.config.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Start cache warming
   */
  public start() {
    if (!this.config.enabled) {
      console.log('Cache warming is disabled');
      return;
    }

    console.log('Starting cache warming manager');

    // Run immediately
    this.warmCache();

    // Schedule periodic warming
    this.intervalId = setInterval(() => {
      this.warmCache();
    }, this.config.interval * 60 * 1000);
  }

  /**
   * Stop cache warming
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('Cache warming manager stopped');
    }
  }

  /**
   * Execute cache warming
   */
  private async warmCache() {
    if (this.isWarming) {
      console.log('Cache warming already in progress, skipping...');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    console.log('Starting cache warming...');

    try {
      // Execute strategies in priority order
      for (const strategy of this.config.strategies) {
        try {
          console.log(`Executing strategy: ${strategy.name}`);
          await strategy.execute();
        } catch (error) {
          console.error(`Error in strategy ${strategy.name}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Cache warming completed in ${duration}ms`);

      // Track warming metrics
      await redis.setex('cache:warming:last-run', 3600, new Date().toISOString());
      await redis.setex('cache:warming:last-duration', 3600, duration.toString());
    } catch (error) {
      console.error('Error during cache warming:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Get warming statistics
   */
  public async getStats() {
    const lastRun = await redis.get('cache:warming:last-run');
    const lastDuration = await redis.get('cache:warming:last-duration');

    return {
      enabled: this.config.enabled,
      interval: this.config.interval,
      strategies: this.config.strategies.length,
      lastRun: lastRun ? new Date(lastRun) : null,
      lastDuration: lastDuration ? parseInt(lastDuration, 10) : null,
      isWarming: this.isWarming,
    };
  }

  /**
   * Manually trigger cache warming
   */
  public async triggerWarming() {
    await this.warmCache();
  }
}

// Singleton instance
let warmingManager: CacheWarmingManager | null = null;

/**
 * Initialize cache warming manager
 */
export function initCacheWarming(config?: Partial<CacheWarmingConfig>): CacheWarmingManager {
  if (!warmingManager) {
    warmingManager = new CacheWarmingManager(config);
    warmingManager.start();
  }
  return warmingManager;
}

/**
 * Get cache warming manager
 */
export function getCacheWarmingManager(): CacheWarmingManager | null {
  return warmingManager;
}

/**
 * Stop cache warming
 */
export function stopCacheWarming() {
  if (warmingManager) {
    warmingManager.stop();
    warmingManager = null;
  }
}
