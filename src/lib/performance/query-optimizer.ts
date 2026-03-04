/**
 * QUERY OPTIMIZER
 * Optimize Prisma queries to prevent N+1 problems and improve performance
 */

import { Prisma } from '@prisma/client'

export class QueryOptimizer {
  /**
   * Dataset query with optimized includes
   */
  static getDatasetWithRelations() {
    return {
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        policies: {
          select: {
            id: true,
            clientTenantId: true,
            status: true,
          },
          take: 5,
        },
        leases: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
          },
          where: {
            status: { in: ['ACTIVE', 'PENDING'] },
          },
          take: 5,
        },
      },
    }
  }

  /**
   * Batch load datasets with single query
   */
  static async batchLoadDatasets(
    prisma: any,
    datasetIds: string[]
  ) {
    // Single query instead of N queries
    const datasets = await prisma.dataset.findMany({
      where: {
        id: { in: datasetIds },
      },
      ...this.getDatasetWithRelations(),
    })

    // Create map for O(1) lookup
    const datasetMap = new Map(
      datasets.map(d => [d.id, d])
    )

    return datasetMap
  }

  /**
   * Optimized policy query with aggregations
   */
  static async getPoliciesWithStats(
    prisma: any,
    tenantId: string
  ) {
    // Use aggregation instead of loading all records
    const [policies, stats] = await Promise.all([
      prisma.accessPolicy.findMany({
        where: { clientTenantId: tenantId },
        select: {
          id: true,
          datasetId: true,
          status: true,
          maxHours: true,
          consumedHours: true,
          createdAt: true,
          dataset: {
            select: {
              id: true,
              name: true,
              language: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.accessPolicy.aggregate({
        where: { clientTenantId: tenantId },
        _count: true,
        _sum: {
          maxHours: true,
          consumedHours: true,
        },
      }),
    ])

    return { policies, stats }
  }

  /**
   * Cursor-based pagination for large datasets
   */
  static async paginateWithCursor<T>(
    prisma: any,
    model: string,
    options: {
      where?: any
      cursor?: string
      take?: number
      orderBy?: any
      select?: any
    }
  ) {
    const take = Math.min(options.take || 20, 100)
    
    const items = await (prisma[model] as any).findMany({
      where: options.where,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      take: take + 1, // Fetch one extra to check if there's more
      orderBy: options.orderBy || { createdAt: 'desc' },
      select: options.select,
    })

    const hasMore = items.length > take
    const results = hasMore ? items.slice(0, -1) : items
    const nextCursor = hasMore ? items[take - 1].id : null

    return {
      items: results,
      nextCursor,
      hasMore,
    }
  }

  /**
   * Batch load with DataLoader pattern
   */
  static createDataLoader<K, V>(
    batchLoadFn: (keys: K[]) => Promise<V[]>
  ) {
    const cache = new Map<K, Promise<V>>()
    let batch: K[] = []
    let batchPromise: Promise<V[]> | null = null

    const load = (key: K): Promise<V> => {
      if (cache.has(key)) {
        return cache.get(key)!
      }

      batch.push(key)

      if (!batchPromise) {
        batchPromise = new Promise((resolve) => {
          process.nextTick(() => {
            const currentBatch = batch
            batch = []
            batchPromise = null
            resolve(batchLoadFn(currentBatch))
          })
        })
      }

      const promise = batchPromise.then(results => {
        const index = batch.indexOf(key)
        return results[index]
      })

      cache.set(key, promise)
      return promise
    }

    return { load, clearCache: () => cache.clear() }
  }

  /**
   * Optimize select fields to reduce data transfer
   */
  static getMinimalSelect(fields: string[]) {
    return fields.reduce((acc, field) => {
      acc[field] = true
      return acc
    }, {} as Record<string, boolean>)
  }

  /**
   * Batch count queries
   */
  static async batchCount(
    prisma: any,
    queries: Array<{ model: string; where: any }>
  ) {
    const promises = queries.map(({ model, where }) =>
      (prisma[model] as any).count({ where })
    )

    return Promise.all(promises)
  }

  /**
   * Optimize aggregation queries
   */
  static async getAggregatedStats(
    prisma: any,
    model: string,
    where: any,
    aggregations: {
      count?: boolean
      sum?: string[]
      avg?: string[]
      min?: string[]
      max?: string[]
    }
  ) {
    const agg: any = {}

    if (aggregations.count) agg._count = true
    if (aggregations.sum) {
      agg._sum = aggregations.sum.reduce((acc, field) => {
        acc[field] = true
        return acc
      }, {} as Record<string, boolean>)
    }
    if (aggregations.avg) {
      agg._avg = aggregations.avg.reduce((acc, field) => {
        acc[field] = true
        return acc
      }, {} as Record<string, boolean>)
    }
    if (aggregations.min) {
      agg._min = aggregations.min.reduce((acc, field) => {
        acc[field] = true
        return acc
      }, {} as Record<string, boolean>)
    }
    if (aggregations.max) {
      agg._max = aggregations.max.reduce((acc, field) => {
        acc[field] = true
        return acc
      }, {} as Record<string, boolean>)
    }

    return (prisma[model] as any).aggregate({
      where,
      ...agg,
    })
  }

  /**
   * Parallel query execution
   */
  static async executeParallel<T>(
    queries: Array<() => Promise<T>>
  ): Promise<T[]> {
    return Promise.all(queries.map(q => q()))
  }

  /**
   * Query with timeout
   */
  static async queryWithTimeout<T>(
    query: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> {
    return Promise.race([
      query(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      ),
    ])
  }

  /**
   * Batch exists checks
   */
  static async batchExists(
    prisma: any,
    model: string,
    ids: string[]
  ): Promise<Map<string, boolean>> {
    const results = await (prisma[model] as any).findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })

    const existsMap = new Map<string, boolean>()
    const existingIds = new Set(results.map((r: any) => r.id))

    ids.forEach(id => {
      existsMap.set(id, existingIds.has(id))
    })

    return existsMap
  }

  /**
   * Optimized search with full-text search
   */
  static getFullTextSearchQuery(
    searchTerm: string,
    fields: string[]
  ) {
    return {
      OR: fields.map(field => ({
        [field]: {
          contains: searchTerm,
          mode: 'insensitive' as const,
        },
      })),
    }
  }

  /**
   * Batch update with transaction
   */
  static async batchUpdateTransaction(
    prisma: any,
    updates: Array<{
      model: string
      where: any
      data: any
    }>
  ) {
    return prisma.$transaction(
      updates.map(({ model, where, data }) =>
        (prisma[model] as any).update({ where, data })
      )
    )
  }

  /**
   * Get query execution plan (for debugging)
   */
  static async explainQuery(
    prisma: any,
    query: string
  ) {
    // This would use raw SQL EXPLAIN
    return prisma.$queryRaw`EXPLAIN ANALYZE ${Prisma.raw(query)}`
  }

  /**
   * Cache-aware query wrapper
   */
  static createCachedQuery<T>(
    queryFn: () => Promise<T>,
    cacheKey: string,
    ttl: number = 300
  ) {
    const cache = new Map<string, { data: T; expiresAt: number }>()

    return async (): Promise<T> => {
      const now = Date.now()
      const cached = cache.get(cacheKey)

      if (cached && cached.expiresAt > now) {
        return cached.data
      }

      const data = await queryFn()
      cache.set(cacheKey, {
        data,
        expiresAt: now + ttl * 1000,
      })

      return data
    }
  }
}
