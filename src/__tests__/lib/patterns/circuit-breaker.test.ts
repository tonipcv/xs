/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CircuitBreaker, CircuitBreakerManager } from '@/lib/patterns/circuit-breaker'

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 5000,
    })
  })

  describe('execute', () => {
    it('should execute function when closed', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await breaker.execute(fn)
      
      expect(result).toBe('success')
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should open after threshold failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn)
        } catch {}
      }
      
      expect(breaker.getState()).toBe('OPEN')
    })

    it('should reject when open', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      
      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn)
        } catch {}
      }
      
      // Should reject immediately
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN')
    })

    it('should timeout long operations', async () => {
      const fn = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      )
      
      await expect(breaker.execute(fn)).rejects.toThrow('Timeout')
    })
  })

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = breaker.getStats()
      
      expect(stats.state).toBe('CLOSED')
      expect(stats.failures).toBe(0)
      expect(stats.successes).toBe(0)
    })
  })

  describe('reset', () => {
    it('should reset circuit breaker', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn)
        } catch {}
      }
      
      breaker.reset()
      
      expect(breaker.getState()).toBe('CLOSED')
      expect(breaker.getStats().failures).toBe(0)
    })
  })
})

describe('Circuit Breaker Manager', () => {
  beforeEach(() => {
    CircuitBreakerManager.resetAll()
  })

  describe('get', () => {
    it('should create and retrieve circuit breaker', () => {
      const breaker1 = CircuitBreakerManager.get('test')
      const breaker2 = CircuitBreakerManager.get('test')
      
      expect(breaker1).toBe(breaker2)
    })

    it('should create with custom options', () => {
      const breaker = CircuitBreakerManager.get('custom', {
        failureThreshold: 10,
      })
      
      expect(breaker).toBeDefined()
    })
  })

  describe('list', () => {
    it('should list all breakers', () => {
      CircuitBreakerManager.get('test1')
      CircuitBreakerManager.get('test2')
      
      const list = CircuitBreakerManager.list()
      
      expect(list).toHaveLength(2)
    })
  })

  describe('getStatistics', () => {
    it('should get statistics', () => {
      CircuitBreakerManager.get('test1')
      CircuitBreakerManager.get('test2')
      
      const stats = CircuitBreakerManager.getStatistics()
      
      expect(stats.total).toBe(2)
      expect(stats.byState.CLOSED).toBe(2)
    })
  })
})
