/**
 * CATALOG CACHE LAYER
 * Redis-based caching for catalog search results
 */

import { redis } from '@/lib/redis'
import { DatasetSearchResult } from '@/lib/catalog/dataset-catalog'

export class CatalogCache {
  private static readonly CACHE_PREFIX = 'catalog:search:'
  private static readonly STATS_CACHE_KEY = 'catalog:stats'
  private static readonly TRENDING_CACHE_KEY = 'catalog:trending'
  private static readonly DEFAULT_TTL = 300 // 5 minutes
  private static readonly STATS_TTL = 600 // 10 minutes
  private static readonly TRENDING_TTL = 180 // 3 minutes

  /**
   * Generate cache key from search parameters
   */
  private static generateCacheKey(filters: any, options: any): string {
    const key = JSON.stringify({ filters, options })
    return `${this.CACHE_PREFIX}${Buffer.from(key).toString('base64')}`
  }

  /**
   * Get cached search results
   */
  static async getSearchResults(
    filters: any,
    options: any
  ): Promise<DatasetSearchResult | null> {
    try {
      const cacheKey = this.generateCacheKey(filters, options)
      const cached = await redis.get(cacheKey)

      if (!cached) return null

      const parsed = JSON.parse(cached)
      
      // Convert BigInt strings back to BigInt
      if (parsed.datasets) {
        parsed.datasets = parsed.datasets.map((d: any) => ({
          ...d,
          totalSizeBytes: BigInt(d.totalSizeBytes),
        }))
      }

      return parsed
    } catch (error) {
      console.error('[CatalogCache] Error getting cached results:', error)
      return null
    }
  }

  /**
   * Cache search results
   */
  static async setSearchResults(
    filters: any,
    options: any,
    results: DatasetSearchResult,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(filters, options)
      
      // Convert BigInt to string for JSON serialization
      const serializable = {
        ...results,
        datasets: results.datasets.map(d => ({
          ...d,
          totalSizeBytes: d.totalSizeBytes.toString(),
        })),
      }

      await redis.setex(cacheKey, ttl, JSON.stringify(serializable))
    } catch (error) {
      console.error('[CatalogCache] Error caching results:', error)
    }
  }

  /**
   * Get cached statistics
   */
  static async getStatistics(): Promise<any | null> {
    try {
      const cached = await redis.get(this.STATS_CACHE_KEY)
      if (!cached) return null

      const parsed = JSON.parse(cached)
      
      // Convert BigInt
      if (parsed.totalSizeBytes) {
        parsed.totalSizeBytes = BigInt(parsed.totalSizeBytes)
      }

      return parsed
    } catch (error) {
      console.error('[CatalogCache] Error getting cached stats:', error)
      return null
    }
  }

  /**
   * Cache statistics
   */
  static async setStatistics(stats: any): Promise<void> {
    try {
      const serializable = {
        ...stats,
        totalSizeBytes: stats.totalSizeBytes.toString(),
      }

      await redis.setex(
        this.STATS_CACHE_KEY,
        this.STATS_TTL,
        JSON.stringify(serializable)
      )
    } catch (error) {
      console.error('[CatalogCache] Error caching stats:', error)
    }
  }

  /**
   * Get cached trending datasets
   */
  static async getTrending(): Promise<any[] | null> {
    try {
      const cached = await redis.get(this.TRENDING_CACHE_KEY)
      if (!cached) return null

      const parsed = JSON.parse(cached)
      
      // Convert BigInt
      return parsed.map((d: any) => ({
        ...d,
        totalSizeBytes: BigInt(d.totalSizeBytes),
      }))
    } catch (error) {
      console.error('[CatalogCache] Error getting cached trending:', error)
      return null
    }
  }

  /**
   * Cache trending datasets
   */
  static async setTrending(datasets: any[]): Promise<void> {
    try {
      const serializable = datasets.map(d => ({
        ...d,
        totalSizeBytes: d.totalSizeBytes.toString(),
      }))

      await redis.setex(
        this.TRENDING_CACHE_KEY,
        this.TRENDING_TTL,
        JSON.stringify(serializable)
      )
    } catch (error) {
      console.error('[CatalogCache] Error caching trending:', error)
    }
  }

  /**
   * Invalidate all catalog cache
   */
  static async invalidateAll(): Promise<void> {
    try {
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`)
      
      if (keys.length > 0) {
        await Promise.all(keys.map((key: string) => redis.del(key)))
      }

      await redis.del(this.STATS_CACHE_KEY)
      await redis.del(this.TRENDING_CACHE_KEY)
    } catch (error) {
      console.error('[CatalogCache] Error invalidating cache:', error)
    }
  }

  /**
   * Invalidate cache for specific dataset
   */
  static async invalidateDataset(datasetId: string): Promise<void> {
    try {
      // Invalidate all search results (they might contain this dataset)
      const searchKeys = await redis.keys(`${this.CACHE_PREFIX}*`)
      
      if (searchKeys.length > 0) {
        await Promise.all(searchKeys.map((key: string) => redis.del(key)))
      }

      // Invalidate stats and trending
      await redis.del(this.STATS_CACHE_KEY)
      await redis.del(this.TRENDING_CACHE_KEY)
    } catch (error) {
      console.error('[CatalogCache] Error invalidating dataset cache:', error)
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    searchCacheSize: number
    statsExists: boolean
    trendingExists: boolean
  }> {
    try {
      const searchKeys = await redis.keys(`${this.CACHE_PREFIX}*`)
      const statsExists = !!(await redis.get(this.STATS_CACHE_KEY))
      const trendingExists = !!(await redis.get(this.TRENDING_CACHE_KEY))

      return {
        searchCacheSize: searchKeys.length,
        statsExists,
        trendingExists,
      }
    } catch (error) {
      console.error('[CatalogCache] Error getting cache stats:', error)
      return {
        searchCacheSize: 0,
        statsExists: false,
        trendingExists: false,
      }
    }
  }

  /**
   * Warm up cache with common queries
   */
  static async warmUp(commonQueries: Array<{ filters: any; options: any }>): Promise<void> {
    // This would be called during deployment to pre-populate cache
    // Implementation depends on having actual data
    console.log('[CatalogCache] Cache warm-up initiated for', commonQueries.length, 'queries')
  }
}
