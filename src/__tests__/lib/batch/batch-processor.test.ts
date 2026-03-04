/**
 * Batch Processor Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BatchProcessor } from '@/lib/batch/batch-processor'

describe('Batch Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processBatch', () => {
    it('should process all items successfully', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i)
      const processor = vi.fn(async (n: number) => n * 2)

      const result = await BatchProcessor.processBatch({
        items,
        processor,
        batchSize: 3,
        concurrency: 2,
      })

      expect(result.totalProcessed).toBe(10)
      expect(result.totalErrors).toBe(0)
      expect(result.results).toHaveLength(10)
      expect(result.results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18])
    })

    it('should handle errors gracefully', async () => {
      const items = [1, 2, 3, 4, 5]
      const processor = vi.fn(async (n: number) => {
        if (n === 3) throw new Error('Failed')
        return n * 2
      })

      const result = await BatchProcessor.processBatch({
        items,
        processor,
      })

      expect(result.totalProcessed).toBe(4)
      expect(result.totalErrors).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].item).toBe(3)
    })

    it('should call progress callback', async () => {
      const items = [1, 2, 3, 4, 5]
      const processor = vi.fn(async (n: number) => n * 2)
      const onProgress = vi.fn()

      await BatchProcessor.processBatch({
        items,
        processor,
        onProgress,
      })

      expect(onProgress).toHaveBeenCalledTimes(5)
      expect(onProgress).toHaveBeenLastCalledWith(5, 5)
    })

    it('should call error callback', async () => {
      const items = [1, 2, 3]
      const processor = vi.fn(async (n: number) => {
        if (n === 2) throw new Error('Failed')
        return n * 2
      })
      const onError = vi.fn()

      await BatchProcessor.processBatch({
        items,
        processor,
        onError,
      })

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(2, expect.any(Error))
    })

    it('should respect batch size', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const processor = vi.fn(async (n: number) => n)

      await BatchProcessor.processBatch({
        items,
        processor,
        batchSize: 10,
        concurrency: 1,
      })

      expect(processor).toHaveBeenCalledTimes(100)
    })
  })

  describe('processParallel', () => {
    it('should process items in parallel', async () => {
      const items = [1, 2, 3, 4, 5]
      const processor = vi.fn(async (n: number) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return n * 2
      })

      const results = await BatchProcessor.processParallel(
        items,
        processor,
        3
      )

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(processor).toHaveBeenCalledTimes(5)
    })

    it('should maintain order of results', async () => {
      const items = [5, 4, 3, 2, 1]
      const processor = vi.fn(async (n: number) => n * 2)

      const results = await BatchProcessor.processParallel(
        items,
        processor,
        2
      )

      expect(results).toEqual([10, 8, 6, 4, 2])
    })
  })

  describe('retryFailed', () => {
    it('should retry failed items', async () => {
      let attempts = 0
      const failedItems = [
        { item: 1, error: new Error('Failed') },
        { item: 2, error: new Error('Failed') },
      ]
      
      const processor = vi.fn(async (n: number) => {
        attempts++
        if (attempts <= 2) throw new Error('Still failing')
        return n * 2
      })

      const result = await BatchProcessor.retryFailed(
        failedItems,
        processor,
        3,
        10
      )

      expect(result.totalProcessed).toBe(2)
      expect(result.totalErrors).toBe(0)
    })

    it('should give up after max retries', async () => {
      const failedItems = [
        { item: 1, error: new Error('Failed') },
      ]
      
      const processor = vi.fn(async () => {
        throw new Error('Always fails')
      })

      const result = await BatchProcessor.retryFailed(
        failedItems,
        processor,
        3,
        10
      )

      expect(result.totalProcessed).toBe(0)
      expect(result.totalErrors).toBe(1)
      expect(processor).toHaveBeenCalledTimes(3)
    })
  })

  describe('streamProcess', () => {
    it('should stream process items', async () => {
      const items = Array.from({ length: 25 }, (_, i) => i)
      const processor = vi.fn(async (n: number) => n * 2)

      const batches: number[][] = []
      for await (const batch of BatchProcessor.streamProcess(
        items,
        processor,
        10
      )) {
        batches.push(batch)
      }

      expect(batches).toHaveLength(3)
      expect(batches[0]).toHaveLength(10)
      expect(batches[1]).toHaveLength(10)
      expect(batches[2]).toHaveLength(5)
    })
  })

  describe('getStatistics', () => {
    it('should calculate statistics correctly', () => {
      const result = {
        results: [1, 2, 3],
        errors: [{ item: 4, error: new Error() }],
        totalProcessed: 3,
        totalErrors: 1,
        duration: 1000,
      }

      const stats = BatchProcessor.getStatistics(result)

      expect(stats.successRate).toBe(75)
      expect(stats.errorRate).toBe(25)
      expect(stats.throughput).toBe(4) // 4 items per second
      expect(stats.avgTimePerItem).toBe(250) // 250ms per item
    })

    it('should handle zero duration', () => {
      const result = {
        results: [1, 2, 3],
        errors: [],
        totalProcessed: 3,
        totalErrors: 0,
        duration: 0,
      }

      const stats = BatchProcessor.getStatistics(result)

      expect(stats.successRate).toBe(100)
      expect(stats.errorRate).toBe(0)
      expect(stats.throughput).toBe(0)
    })
  })

  describe('batchInsert', () => {
    it('should insert in chunks', async () => {
      const mockModel = {
        createMany: vi.fn().mockResolvedValue({ count: 10 }),
      }

      const data = Array.from({ length: 25 }, (_, i) => ({ id: i }))

      const result = await BatchProcessor.batchInsert(
        mockModel,
        data,
        10
      )

      expect(mockModel.createMany).toHaveBeenCalledTimes(3)
      expect(result.count).toBe(30) // 3 chunks * 10 each
    })
  })

  describe('batchUpdate', () => {
    it('should update multiple records', async () => {
      const mockModel = {
        update: vi.fn().mockResolvedValue({}),
      }

      const updates = [
        { id: '1', data: { name: 'Updated 1' } },
        { id: '2', data: { name: 'Updated 2' } },
        { id: '3', data: { name: 'Updated 3' } },
      ]

      const result = await BatchProcessor.batchUpdate(
        mockModel,
        updates,
        2
      )

      expect(mockModel.update).toHaveBeenCalledTimes(3)
      expect(result.updated).toBe(3)
      expect(result.failed).toBe(0)
    })

    it('should handle update failures', async () => {
      const mockModel = {
        update: vi.fn()
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce({}),
      }

      const updates = [
        { id: '1', data: { name: 'Updated 1' } },
        { id: '2', data: { name: 'Updated 2' } },
        { id: '3', data: { name: 'Updated 3' } },
      ]

      const result = await BatchProcessor.batchUpdate(
        mockModel,
        updates,
        10
      )

      expect(result.updated).toBe(2)
      expect(result.failed).toBe(1)
    })
  })

  describe('batchDelete', () => {
    it('should soft delete records', async () => {
      const mockModel = {
        updateMany: vi.fn().mockResolvedValue({ count: 10 }),
      }

      const ids = Array.from({ length: 25 }, (_, i) => `id_${i}`)

      const result = await BatchProcessor.batchDelete(
        mockModel,
        ids,
        true,
        10
      )

      expect(mockModel.updateMany).toHaveBeenCalledTimes(3)
      expect(result.deleted).toBe(30)
    })

    it('should hard delete records', async () => {
      const mockModel = {
        deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
      }

      const ids = Array.from({ length: 15 }, (_, i) => `id_${i}`)

      const result = await BatchProcessor.batchDelete(
        mockModel,
        ids,
        false,
        10
      )

      expect(mockModel.deleteMany).toHaveBeenCalledTimes(2)
      expect(result.deleted).toBe(20)
    })
  })

  describe('batchUpsert', () => {
    it('should create new records', async () => {
      const mockModel = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      }

      const data = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ]

      const result = await BatchProcessor.batchUpsert(
        mockModel,
        data,
        10
      )

      expect(mockModel.create).toHaveBeenCalledTimes(2)
      expect(result.created).toBe(2)
      expect(result.updated).toBe(0)
    })

    it('should update existing records', async () => {
      const mockModel = {
        findUnique: vi.fn().mockResolvedValue({ id: '1' }),
        update: vi.fn().mockResolvedValue({}),
      }

      const data = [
        { id: '1', name: 'Updated Item 1' },
      ]

      const result = await BatchProcessor.batchUpsert(
        mockModel,
        data,
        10
      )

      expect(mockModel.update).toHaveBeenCalledTimes(1)
      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
    })
  })
})
