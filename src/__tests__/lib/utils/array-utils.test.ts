/**
 * Array Utilities Tests
 */

import { describe, it, expect } from 'vitest'
import { ArrayUtils } from '@/lib/utils/array-utils'

describe('Array Utilities', () => {
  describe('chunk', () => {
    it('should chunk array into smaller arrays', () => {
      const result = ArrayUtils.chunk([1, 2, 3, 4, 5], 2)
      expect(result).toEqual([[1, 2], [3, 4], [5]])
    })
  })

  describe('unique', () => {
    it('should remove duplicates', () => {
      const result = ArrayUtils.unique([1, 2, 2, 3, 3, 3])
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('uniqueBy', () => {
    it('should remove duplicates by key', () => {
      const data = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'C' },
      ]
      const result = ArrayUtils.uniqueBy(data, 'id')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(2)
    })
  })

  describe('flatten', () => {
    it('should flatten nested arrays', () => {
      const result = ArrayUtils.flatten([1, [2, [3, [4]]]])
      expect(result).toEqual([1, 2, 3, 4])
    })
  })

  describe('groupBy', () => {
    it('should group by key', () => {
      const data = [
        { type: 'A', value: 1 },
        { type: 'B', value: 2 },
        { type: 'A', value: 3 },
      ]
      const result = ArrayUtils.groupBy(data, 'type')
      expect(result.A).toHaveLength(2)
      expect(result.B).toHaveLength(1)
    })
  })

  describe('sortBy', () => {
    it('should sort by key ascending', () => {
      const data = [{ age: 30 }, { age: 20 }, { age: 25 }]
      const result = ArrayUtils.sortBy(data, 'age', 'asc')
      expect(result[0].age).toBe(20)
      expect(result[2].age).toBe(30)
    })

    it('should sort by key descending', () => {
      const data = [{ age: 30 }, { age: 20 }, { age: 25 }]
      const result = ArrayUtils.sortBy(data, 'age', 'desc')
      expect(result[0].age).toBe(30)
      expect(result[2].age).toBe(20)
    })
  })

  describe('shuffle', () => {
    it('should shuffle array', () => {
      const data = [1, 2, 3, 4, 5]
      const result = ArrayUtils.shuffle(data)
      expect(result).toHaveLength(5)
      expect(result).toContain(1)
      expect(result).toContain(5)
    })
  })

  describe('intersection', () => {
    it('should find intersection', () => {
      const result = ArrayUtils.intersection([1, 2, 3], [2, 3, 4], [3, 4, 5])
      expect(result).toEqual([3])
    })
  })

  describe('difference', () => {
    it('should find difference', () => {
      const result = ArrayUtils.difference([1, 2, 3], [2, 3], [3])
      expect(result).toEqual([1])
    })
  })

  describe('union', () => {
    it('should find union', () => {
      const result = ArrayUtils.union([1, 2], [2, 3], [3, 4])
      expect(result).toEqual([1, 2, 3, 4])
    })
  })

  describe('partition', () => {
    it('should partition by predicate', () => {
      const [even, odd] = ArrayUtils.partition([1, 2, 3, 4, 5], n => n % 2 === 0)
      expect(even).toEqual([2, 4])
      expect(odd).toEqual([1, 3, 5])
    })
  })

  describe('sum', () => {
    it('should sum array', () => {
      const result = ArrayUtils.sum([1, 2, 3, 4, 5])
      expect(result).toBe(15)
    })
  })

  describe('average', () => {
    it('should calculate average', () => {
      const result = ArrayUtils.average([1, 2, 3, 4, 5])
      expect(result).toBe(3)
    })
  })

  describe('median', () => {
    it('should calculate median for odd length', () => {
      const result = ArrayUtils.median([1, 2, 3, 4, 5])
      expect(result).toBe(3)
    })

    it('should calculate median for even length', () => {
      const result = ArrayUtils.median([1, 2, 3, 4])
      expect(result).toBe(2.5)
    })
  })

  describe('range', () => {
    it('should create range', () => {
      const result = ArrayUtils.range(0, 5)
      expect(result).toEqual([0, 1, 2, 3, 4])
    })

    it('should create range with step', () => {
      const result = ArrayUtils.range(0, 10, 2)
      expect(result).toEqual([0, 2, 4, 6, 8])
    })
  })

  describe('pluck', () => {
    it('should pluck property', () => {
      const data = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
      const result = ArrayUtils.pluck(data, 'name')
      expect(result).toEqual(['A', 'B', 'C'])
    })
  })
})
