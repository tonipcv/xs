/**
 * CACHED DATASET CATALOG
 * Wrapper around DatasetCatalog with caching layer
 */

import { DatasetCatalog, DatasetSearchFilters, DatasetSearchOptions } from './dataset-catalog'
import { CatalogCache } from '@/lib/cache/catalog-cache'

export class CachedDatasetCatalog {
  /**
   * Search with caching
   */
  static async search(
    filters: DatasetSearchFilters = {},
    options: DatasetSearchOptions = {}
  ) {
    // Try cache first
    const cached = await CatalogCache.getSearchResults(filters, options)
    if (cached) {
      return cached
    }

    // Cache miss - fetch from database
    const results = await DatasetCatalog.search(filters, options)

    // Cache results
    await CatalogCache.setSearchResults(filters, options, results)

    return results
  }

  /**
   * Get statistics with caching
   */
  static async getStatistics() {
    // Try cache first
    const cached = await CatalogCache.getStatistics()
    if (cached) {
      return cached
    }

    // Cache miss - fetch from database
    const stats = await DatasetCatalog.getStatistics()

    // Cache results
    await CatalogCache.setStatistics(stats)

    return stats
  }

  /**
   * Get trending with caching
   */
  static async getTrending(limit: number = 10) {
    // Try cache first
    const cached = await CatalogCache.getTrending()
    if (cached) {
      return cached.slice(0, limit)
    }

    // Cache miss - fetch from database
    const trending = await DatasetCatalog.getTrending(limit)

    // Cache results
    await CatalogCache.setTrending(trending)

    return trending
  }

  /**
   * Get by ID (no caching - always fresh)
   */
  static async getById(datasetId: string) {
    return DatasetCatalog.getById(datasetId)
  }

  /**
   * Get similar (no caching - always fresh)
   */
  static async getSimilar(datasetId: string, limit: number = 5) {
    return DatasetCatalog.getSimilar(datasetId, limit)
  }

  /**
   * Invalidate cache when dataset changes
   */
  static async invalidateDataset(datasetId: string) {
    await CatalogCache.invalidateDataset(datasetId)
  }

  /**
   * Invalidate all cache
   */
  static async invalidateAll() {
    await CatalogCache.invalidateAll()
  }
}
