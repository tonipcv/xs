/**
 * Redis Caching Layer
 * High-performance caching system with TTL and invalidation
 */

import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

let isConnected = false;

async function ensureRedisConnection() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Tags for cache invalidation
}

/**
 * Get value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    await ensureRedisConnection();
    
    const value = await redisClient.get(key);
    
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set value in cache
 */
export async function cacheSet(
  key: string,
  value: any,
  options: CacheOptions = {}
): Promise<void> {
  try {
    await ensureRedisConnection();

    const serialized = JSON.stringify(value);
    
    if (options.ttl) {
      await redisClient.setEx(key, options.ttl, serialized);
    } else {
      await redisClient.set(key, serialized);
    }

    // Store tags for invalidation
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        await redisClient.sAdd(`tag:${tag}`, key);
      }
    }
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Delete value from cache
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    await ensureRedisConnection();
    await redisClient.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

/**
 * Invalidate cache by tag
 */
export async function cacheInvalidateByTag(tag: string): Promise<void> {
  try {
    await ensureRedisConnection();

    const keys = await redisClient.sMembers(`tag:${tag}`);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      await redisClient.del(`tag:${tag}`);
    }
  } catch (error) {
    console.error('Cache invalidate by tag error:', error);
  }
}

/**
 * Clear all cache
 */
export async function cacheClear(): Promise<void> {
  try {
    await ensureRedisConnection();
    await redisClient.flushDb();
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

/**
 * Get or set cache with function
 */
export async function cacheGetOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = await cacheGet<T>(key);
  
  if (cached !== null) {
    return cached;
  }

  const value = await fn();
  await cacheSet(key, value, options);
  
  return value;
}

/**
 * Cache decorator for functions
 */
export function cacheable(options: CacheOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
      
      return cacheGetOrSet(
        cacheKey,
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * Predefined cache TTLs
 */
export const CacheTTL = {
  SHORT: 60,           // 1 minute
  MEDIUM: 300,         // 5 minutes
  LONG: 3600,          // 1 hour
  DAY: 86400,          // 24 hours
  WEEK: 604800,        // 7 days
};

/**
 * Cache key builders
 */
export const CacheKeys = {
  user: (userId: string) => `user:${userId}`,
  tenant: (tenantId: string) => `tenant:${tenantId}`,
  dataset: (datasetId: string) => `dataset:${datasetId}`,
  policy: (policyId: string) => `policy:${policyId}`,
  lease: (leaseId: string) => `lease:${leaseId}`,
  apiKey: (keyHash: string) => `apikey:${keyHash}`,
  session: (sessionId: string) => `session:${sessionId}`,
  
  // List caches
  userDatasets: (userId: string) => `user:${userId}:datasets`,
  tenantMembers: (tenantId: string) => `tenant:${tenantId}:members`,
  tenantPolicies: (tenantId: string) => `tenant:${tenantId}:policies`,
  
  // Computed caches
  datasetStats: (datasetId: string) => `dataset:${datasetId}:stats`,
  tenantUsage: (tenantId: string, period: string) => `tenant:${tenantId}:usage:${period}`,
};

/**
 * Cache tags for invalidation
 */
export const CacheTags = {
  USER: 'user',
  TENANT: 'tenant',
  DATASET: 'dataset',
  POLICY: 'policy',
  LEASE: 'lease',
  BILLING: 'billing',
  AUDIT: 'audit',
};

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  keys: number;
  memory: string;
  hits: number;
  misses: number;
}> {
  try {
    await ensureRedisConnection();

    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();

    // Parse info string
    const lines = info.split('\r\n');
    const stats: any = {};
    
    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    }

    return {
      keys: dbSize,
      memory: stats.used_memory_human || '0',
      hits: parseInt(stats.keyspace_hits || '0'),
      misses: parseInt(stats.keyspace_misses || '0'),
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      keys: 0,
      memory: '0',
      hits: 0,
      misses: 0,
    };
  }
}

/**
 * Warm up cache with frequently accessed data
 */
export async function warmupCache(tenantId: string): Promise<void> {
  try {
    // This would be implemented based on your specific needs
    // Example: pre-load tenant data, members, policies, etc.
    console.log(`Warming up cache for tenant: ${tenantId}`);
  } catch (error) {
    console.error('Cache warmup error:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isConnected) {
    await redisClient.quit();
  }
});
