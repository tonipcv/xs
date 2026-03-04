/**
 * QUERY CACHE
 * Intelligent query result caching
 */

import { redis } from '@/lib/redis'

export interface QueryCacheOptions {
  ttl?: number
  tags?: string[]
  invalidateOn?: string[]
  key?: string
}

export class QueryCache {
  private static readonly DEFAULT_TTL = 300 // 5 minutes
  private static readonly PREFIX = 'query:'

  /**
   * Cache query result
   */
  static async cache<T>(
    query: () => Promise<T>,
    options: QueryCacheOptions = {}
  ): Promise<T> {
    const key = options.key || this.generateKey(query.toString())
    const cacheKey = `${this.PREFIX}${key}`

    // Try to get from cache
    const cached = await this.get<T>(cacheKey)
    if (cached !== null) {
      return cached
    }

    // Execute query
    const result = await query()

    // Store in cache
    await this.set(cacheKey, result, options.ttl || this.DEFAULT_TTL)

    // Store tags
    if (options.tags && options.tags.length > 0) {
      await this.storeTags(cacheKey, options.tags)
    }

    return result
  }

  /**
   * Get from cache
   */
  private static async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  /**
   * Set in cache
   */
  private static async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      console.error('[QueryCache] Set error:', error)
    }
  }

  /**
   * Generate cache key
   */
  private static generateKey(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Store tags
   */
  private static async storeTags(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `${this.PREFIX}tag:${tag}`
      try {
        const existing = await redis.get(tagKey)
        const keys = existing ? JSON.parse(existing) : []
        keys.push(key)
        await redis.setex(tagKey, 86400, JSON.stringify(keys))
      } catch (error) {
        console.error('[QueryCache] Store tags error:', error)
      }
    }
  }

  /**
   * Invalidate by tag
   */
  static async invalidateTag(tag: string): Promise<number> {
    const tagKey = `${this.PREFIX}tag:${tag}`
    
    try {
      const cached = await redis.get(tagKey)
      if (!cached) return 0

      const keys = JSON.parse(cached)
      let deleted = 0

      for (const key of keys) {
        await redis.del(key)
        deleted++
      }

      await redis.del(tagKey)
      return deleted
    } catch (error) {
      console.error('[QueryCache] Invalidate tag error:', error)
      return 0
    }
  }

  /**
   * Invalidate by pattern
   */
  static async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(`${this.PREFIX}${pattern}`)
      let deleted = 0

      for (const key of keys) {
        await redis.del(key)
        deleted++
      }

      return deleted
    } catch (error) {
      console.error('[QueryCache] Invalidate pattern error:', error)
      return 0
    }
  }

  /**
   * Clear all cache
   */
  static async clear(): Promise<number> {
    return this.invalidatePattern('*')
  }

  /**
   * Get cache statistics
   */
  static async getStatistics(): Promise<{
    totalKeys: number
    totalTags: number
    estimatedSize: number
  }> {
    try {
      const queryKeys = await redis.keys(`${this.PREFIX}*`)
      const tagKeys = queryKeys.filter(k => k.includes(':tag:'))

      return {
        totalKeys: queryKeys.length - tagKeys.length,
        totalTags: tagKeys.length,
        estimatedSize: queryKeys.length,
      }
    } catch {
      return {
        totalKeys: 0,
        totalTags: 0,
        estimatedSize: 0,
      }
    }
  }

  /**
   * Warm cache
   */
  static async warm<T>(
    queries: Array<{ query: () => Promise<T>; options?: QueryCacheOptions }>
  ): Promise<number> {
    let warmed = 0

    for (const { query, options } of queries) {
      try {
        await this.cache(query, options)
        warmed++
      } catch (error) {
        console.error('[QueryCache] Warm error:', error)
      }
    }

    return warmed
  }
}
