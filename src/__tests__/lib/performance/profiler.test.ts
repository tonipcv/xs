/**
 * Performance Profiler Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Profiler } from '@/lib/performance/profiler'

describe('Performance Profiler', () => {
  beforeEach(() => {
    Profiler.clear()
  })

  describe('start and end', () => {
    it('should profile operation', () => {
      const id = Profiler.start('test-operation')
      
      expect(id).toBeDefined()
      expect(id).toMatch(/^prof_/)

      const duration = Profiler.end(id)
      
      expect(duration).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 for unknown id', () => {
      const duration = Profiler.end('unknown-id')
      
      expect(duration).toBe(0)
    })
  })

  describe('profile async', () => {
    it('should profile async function', async () => {
      const result = await Profiler.profile('async-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'success'
      })

      expect(result.result).toBe('success')
      expect(result.duration).toBeGreaterThan(0)
    })

    it('should handle errors in async function', async () => {
      await expect(
        Profiler.profile('async-error', async () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')
    })
  })

  describe('profileSync', () => {
    it('should profile sync function', () => {
      const result = Profiler.profileSync('sync-test', () => {
        return 42
      })

      expect(result.result).toBe(42)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should handle errors in sync function', () => {
      expect(() => {
        Profiler.profileSync('sync-error', () => {
          throw new Error('Test error')
        })
      }).toThrow('Test error')
    })
  })

  describe('getProfilesByName', () => {
    it('should get profiles by name', async () => {
      await Profiler.profile('test-op', async () => 'result1')
      await Profiler.profile('test-op', async () => 'result2')
      await Profiler.profile('other-op', async () => 'result3')

      const profiles = Profiler.getProfilesByName('test-op')

      expect(profiles).toHaveLength(2)
      expect(profiles[0].name).toBe('test-op')
      expect(profiles[1].name).toBe('test-op')
    })
  })

  describe('generateReport', () => {
    it('should generate report for all profiles', async () => {
      await Profiler.profile('op1', async () => 'result')
      await Profiler.profile('op2', async () => 'result')
      await Profiler.profile('op1', async () => 'result')

      const reports = Profiler.generateReport()

      expect(reports).toHaveLength(2)
      
      const op1Report = reports.find(r => r.name === 'op1')
      expect(op1Report?.callCount).toBe(2)
      
      const op2Report = reports.find(r => r.name === 'op2')
      expect(op2Report?.callCount).toBe(1)
    })

    it('should generate report for specific name', async () => {
      await Profiler.profile('op1', async () => 'result')
      await Profiler.profile('op2', async () => 'result')

      const reports = Profiler.generateReport('op1')

      expect(reports).toHaveLength(1)
      expect(reports[0].name).toBe('op1')
    })
  })

  describe('getSlowest', () => {
    it('should return slowest operations', async () => {
      await Profiler.profile('fast', async () => 'result')
      await Profiler.profile('slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        return 'result'
      })

      const slowest = Profiler.getSlowest(1)

      expect(slowest).toHaveLength(1)
      expect(slowest[0].name).toBe('slow')
    })
  })

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      await Profiler.profile('op1', async () => 'result')
      await Profiler.profile('op2', async () => 'result')
      await Profiler.profile('op1', async () => 'result')

      const stats = Profiler.getStatistics()

      expect(stats.totalProfiles).toBe(3)
      expect(stats.activeProfiles).toBe(0)
      expect(stats.byName['op1']).toBe(2)
      expect(stats.byName['op2']).toBe(1)
    })
  })

  describe('exportReport', () => {
    it('should export as JSON', async () => {
      await Profiler.profile('test', async () => 'result')

      const json = Profiler.exportReport('json')

      expect(json).toBeDefined()
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should export as text', async () => {
      await Profiler.profile('test', async () => 'result')

      const text = Profiler.exportReport('text')

      expect(text).toContain('Performance Profile Report')
      expect(text).toContain('test:')
    })
  })

  describe('measureMemory', () => {
    it('should measure memory usage', () => {
      const memory = Profiler.measureMemory()

      expect(memory.heapUsed).toBeGreaterThan(0)
      expect(memory.heapTotal).toBeGreaterThan(0)
    })
  })
})
