/**
 * Retry Policy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryPolicy } from '@/lib/resilience/retry-policy'

describe('Retry Policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await RetryPolicy.execute(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success')

      const result = await RetryPolicy.execute(fn, { maxAttempts: 3 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'))

      await expect(
        RetryPolicy.execute(fn, { maxAttempts: 3 })
      ).rejects.toThrow('Always fails')

      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should respect retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Non-retryable error'))

      await expect(
        RetryPolicy.execute(fn, {
          maxAttempts: 3,
          retryableErrors: ['ECONNRESET'],
        })
      ).rejects.toThrow('Non-retryable error')

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success')
      const onRetry = vi.fn()

      await RetryPolicy.execute(fn, { maxAttempts: 3, onRetry })

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
    })
  })

  describe('executeWithResult', () => {
    it('should return success result', async () => {
      const fn = vi.fn().mockResolvedValue('data')

      const result = await RetryPolicy.executeWithResult(fn)

      expect(result.success).toBe(true)
      expect(result.result).toBe('data')
      expect(result.attempts).toBe(1)
      expect(result.totalDuration).toBeGreaterThan(0)
    })

    it('should return failure result', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'))

      const result = await RetryPolicy.executeWithResult(fn, { maxAttempts: 2 })

      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(Error)
      expect(result.attempts).toBe(2)
    })
  })

  describe('retryWithBackoff', () => {
    it('should use custom delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success')

      const result = await RetryPolicy.retryWithBackoff(fn, [100, 200])

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('retryUntil', () => {
    it('should retry until condition is met', async () => {
      let count = 0
      const fn = vi.fn().mockImplementation(() => {
        count++
        return Promise.resolve(count)
      })

      const result = await RetryPolicy.retryUntil(
        fn,
        (value: number) => value >= 3,
        { maxAttempts: 5, initialDelayMs: 10 }
      )

      expect(result).toBe(3)
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw if condition never met', async () => {
      const fn = vi.fn().mockResolvedValue(1)

      await expect(
        RetryPolicy.retryUntil(
          fn,
          (value: number) => value >= 10,
          { maxAttempts: 3, initialDelayMs: 10 }
        )
      ).rejects.toThrow('Condition not met')
    })
  })

  describe('retryBatch', () => {
    it('should retry all items', async () => {
      const items = [1, 2, 3, 4, 5]
      const fn = vi.fn().mockImplementation((n: number) => {
        if (n === 3) throw new Error('Failed')
        return Promise.resolve(n * 2)
      })

      const result = await RetryPolicy.retryBatch(items, fn, { maxAttempts: 1 })

      expect(result.successful).toEqual([1, 2, 4, 5])
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].item).toBe(3)
    })
  })

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const delay1 = RetryPolicy.calculateBackoff(1, 1000, 2, 10000)
      const delay2 = RetryPolicy.calculateBackoff(2, 1000, 2, 10000)
      const delay3 = RetryPolicy.calculateBackoff(3, 1000, 2, 10000)

      expect(delay1).toBe(1000)
      expect(delay2).toBe(2000)
      expect(delay3).toBe(4000)
    })

    it('should respect max delay', () => {
      const delay = RetryPolicy.calculateBackoff(10, 1000, 2, 5000)

      expect(delay).toBe(5000)
    })

    it('should add jitter', () => {
      const delay1 = RetryPolicy.calculateBackoff(1, 1000, 2, 10000, true)
      const delay2 = RetryPolicy.calculateBackoff(1, 1000, 2, 10000, true)

      expect(delay1).toBeGreaterThanOrEqual(500)
      expect(delay1).toBeLessThanOrEqual(1000)
      expect(delay1).not.toBe(delay2) // Should be different due to randomness
    })
  })
})
