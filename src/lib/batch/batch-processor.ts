/**
 * BATCH PROCESSOR
 * Optimized batch operations for high-throughput processing
 */

import { prisma } from '@/lib/prisma'

export interface BatchOperation<T, R> {
  items: T[]
  processor: (item: T) => Promise<R>
  batchSize?: number
  concurrency?: number
  onProgress?: (completed: number, total: number) => void
  onError?: (item: T, error: Error) => void
}

export interface BatchResult<R> {
  results: R[]
  errors: Array<{ item: any; error: Error }>
  totalProcessed: number
  totalErrors: number
  duration: number
}

export class BatchProcessor {
  /**
   * Process items in batches with concurrency control
   */
  static async processBatch<T, R>(
    operation: BatchOperation<T, R>
  ): Promise<BatchResult<R>> {
    const startTime = Date.now()
    const {
      items,
      processor,
      batchSize = 100,
      concurrency = 5,
      onProgress,
      onError,
    } = operation

    const results: R[] = []
    const errors: Array<{ item: T; error: Error }> = []
    let completed = 0

    // Split into batches
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += concurrency) {
      const currentBatches = batches.slice(i, i + concurrency)
      
      const batchPromises = currentBatches.map(async (batch) => {
        const batchResults: R[] = []
        
        for (const item of batch) {
          try {
            const result = await processor(item)
            batchResults.push(result)
            completed++
            
            if (onProgress) {
              onProgress(completed, items.length)
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error))
            errors.push({ item, error: err })
            
            if (onError) {
              onError(item, err)
            }
          }
        }
        
        return batchResults
      })

      const batchResultsArray = await Promise.all(batchPromises)
      results.push(...batchResultsArray.flat())
    }

    const duration = Date.now() - startTime

    return {
      results,
      errors,
      totalProcessed: completed,
      totalErrors: errors.length,
      duration,
    }
  }

  /**
   * Batch insert with chunking
   */
  static async batchInsert<T>(
    model: any,
    data: T[],
    chunkSize: number = 1000
  ): Promise<{ count: number; duration: number }> {
    const startTime = Date.now()
    let totalCount = 0

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize)
      const result = await model.createMany({
        data: chunk,
        skipDuplicates: true,
      })
      totalCount += result.count
    }

    return {
      count: totalCount,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Batch update with optimistic locking
   */
  static async batchUpdate<T extends { id: string }>(
    model: any,
    updates: Array<{ id: string; data: Partial<T> }>,
    chunkSize: number = 100
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0
    let failed = 0

    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize)
      
      const promises = chunk.map(async ({ id, data }) => {
        try {
          await model.update({
            where: { id },
            data,
          })
          return true
        } catch (error) {
          console.error(`[BatchProcessor] Failed to update ${id}:`, error)
          return false
        }
      })

      const results = await Promise.all(promises)
      updated += results.filter(r => r).length
      failed += results.filter(r => !r).length
    }

    return { updated, failed }
  }

  /**
   * Batch delete with soft delete support
   */
  static async batchDelete(
    model: any,
    ids: string[],
    softDelete: boolean = true,
    chunkSize: number = 1000
  ): Promise<{ deleted: number }> {
    let deleted = 0

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      
      if (softDelete) {
        const result = await model.updateMany({
          where: { id: { in: chunk } },
          data: { deletedAt: new Date() },
        })
        deleted += result.count
      } else {
        const result = await model.deleteMany({
          where: { id: { in: chunk } },
        })
        deleted += result.count
      }
    }

    return { deleted }
  }

  /**
   * Parallel batch processing with worker pool
   */
  static async processParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    maxConcurrency: number = 10
  ): Promise<R[]> {
    const results: R[] = new Array(items.length)
    const executing = new Set<Promise<void>>()

    for (let i = 0; i < items.length; i++) {
      const index = i
      const promise = processor(items[index]).then(result => {
        results[index] = result
      })

      executing.add(promise)

      if (executing.size >= maxConcurrency) {
        await Promise.race(executing)
        executing.forEach(p => {
          p.then(() => executing.delete(p))
        })
      }
    }

    await Promise.all(Array.from(executing))
    return results
  }

  /**
   * Retry failed operations
   */
  static async retryFailed<T, R>(
    failedItems: Array<{ item: T; error: Error }>,
    processor: (item: T) => Promise<R>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<BatchResult<R>> {
    const results: R[] = []
    const errors: Array<{ item: T; error: Error }> = []

    for (const { item } of failedItems) {
      let lastError: Error | null = null
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
          }
          
          const result = await processor(item)
          results.push(result)
          lastError = null
          break
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
        }
      }

      if (lastError) {
        errors.push({ item, error: lastError })
      }
    }

    return {
      results,
      errors,
      totalProcessed: results.length,
      totalErrors: errors.length,
      duration: 0,
    }
  }

  /**
   * Stream processing for very large datasets
   */
  static async *streamProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 100
  ): AsyncGenerator<R[], void, unknown> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const results = await Promise.all(batch.map(processor))
      yield results
    }
  }

  /**
   * Batch upsert (insert or update)
   */
  static async batchUpsert<T extends { id: string }>(
    model: any,
    data: T[],
    chunkSize: number = 100
  ): Promise<{ created: number; updated: number }> {
    let created = 0
    let updated = 0

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize)
      
      const promises = chunk.map(async (item) => {
        try {
          const existing = await model.findUnique({
            where: { id: item.id },
          })

          if (existing) {
            await model.update({
              where: { id: item.id },
              data: item,
            })
            return 'updated'
          } else {
            await model.create({
              data: item,
            })
            return 'created'
          }
        } catch (error) {
          console.error(`[BatchProcessor] Upsert failed for ${item.id}:`, error)
          return 'failed'
        }
      })

      const results = await Promise.all(promises)
      created += results.filter(r => r === 'created').length
      updated += results.filter(r => r === 'updated').length
    }

    return { created, updated }
  }

  /**
   * Get batch processing statistics
   */
  static getStatistics(result: BatchResult<any>): {
    successRate: number
    errorRate: number
    throughput: number
    avgTimePerItem: number
  } {
    const total = result.totalProcessed + result.totalErrors
    const successRate = total > 0 ? (result.totalProcessed / total) * 100 : 0
    const errorRate = total > 0 ? (result.totalErrors / total) * 100 : 0
    const throughput = result.duration > 0 ? (total / result.duration) * 1000 : 0
    const avgTimePerItem = total > 0 ? result.duration / total : 0

    return {
      successRate,
      errorRate,
      throughput,
      avgTimePerItem,
    }
  }
}
