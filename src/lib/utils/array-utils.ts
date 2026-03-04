/**
 * ARRAY UTILITIES
 * Common array manipulation functions
 */

export class ArrayUtils {
  /**
   * Chunk array into smaller arrays
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Remove duplicates
   */
  static unique<T>(array: T[]): T[] {
    return [...new Set(array)]
  }

  /**
   * Remove duplicates by key
   */
  static uniqueBy<T>(array: T[], key: keyof T): T[] {
    const seen = new Set()
    return array.filter(item => {
      const value = item[key]
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
  }

  /**
   * Flatten array
   */
  static flatten<T>(array: any[]): T[] {
    return array.reduce((acc, val) => 
      Array.isArray(val) ? acc.concat(this.flatten(val)) : acc.concat(val), 
      []
    )
  }

  /**
   * Group by key
   */
  static groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((acc, item) => {
      const group = String(item[key])
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    }, {} as Record<string, T[]>)
  }

  /**
   * Sort by key
   */
  static sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
    return [...array].sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1
      if (aVal > bVal) return order === 'asc' ? 1 : -1
      return 0
    })
  }

  /**
   * Shuffle array
   */
  static shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  /**
   * Sample random items
   */
  static sample<T>(array: T[], count: number = 1): T[] {
    const shuffled = this.shuffle(array)
    return shuffled.slice(0, count)
  }

  /**
   * Intersection of arrays
   */
  static intersection<T>(...arrays: T[][]): T[] {
    if (arrays.length === 0) return []
    return arrays.reduce((acc, arr) => 
      acc.filter(item => arr.includes(item))
    )
  }

  /**
   * Difference between arrays
   */
  static difference<T>(array: T[], ...others: T[][]): T[] {
    const otherItems = new Set(others.flat())
    return array.filter(item => !otherItems.has(item))
  }

  /**
   * Union of arrays
   */
  static union<T>(...arrays: T[][]): T[] {
    return this.unique(arrays.flat())
  }

  /**
   * Partition array by predicate
   */
  static partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
    const pass: T[] = []
    const fail: T[] = []
    
    for (const item of array) {
      if (predicate(item)) {
        pass.push(item)
      } else {
        fail.push(item)
      }
    }
    
    return [pass, fail]
  }

  /**
   * Find duplicates
   */
  static duplicates<T>(array: T[]): T[] {
    const seen = new Set<T>()
    const duplicates = new Set<T>()
    
    for (const item of array) {
      if (seen.has(item)) {
        duplicates.add(item)
      } else {
        seen.add(item)
      }
    }
    
    return Array.from(duplicates)
  }

  /**
   * Compact array (remove falsy values)
   */
  static compact<T>(array: T[]): T[] {
    return array.filter(Boolean)
  }

  /**
   * Zip arrays together
   */
  static zip<T>(...arrays: T[][]): T[][] {
    const length = Math.max(...arrays.map(arr => arr.length))
    const result: T[][] = []
    
    for (let i = 0; i < length; i++) {
      result.push(arrays.map(arr => arr[i]))
    }
    
    return result
  }

  /**
   * Range of numbers
   */
  static range(start: number, end: number, step: number = 1): number[] {
    const result: number[] = []
    for (let i = start; i < end; i += step) {
      result.push(i)
    }
    return result
  }

  /**
   * Sum array
   */
  static sum(array: number[]): number {
    return array.reduce((acc, val) => acc + val, 0)
  }

  /**
   * Average
   */
  static average(array: number[]): number {
    return array.length > 0 ? this.sum(array) / array.length : 0
  }

  /**
   * Median
   */
  static median(array: number[]): number {
    if (array.length === 0) return 0
    
    const sorted = [...array].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  }

  /**
   * Min value
   */
  static min(array: number[]): number {
    return Math.min(...array)
  }

  /**
   * Max value
   */
  static max(array: number[]): number {
    return Math.max(...array)
  }

  /**
   * Count occurrences
   */
  static countBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((acc, item) => {
      const value = String(item[key])
      acc[value] = (acc[value] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  /**
   * Take first n items
   */
  static take<T>(array: T[], count: number): T[] {
    return array.slice(0, count)
  }

  /**
   * Take last n items
   */
  static takeLast<T>(array: T[], count: number): T[] {
    return array.slice(-count)
  }

  /**
   * Drop first n items
   */
  static drop<T>(array: T[], count: number): T[] {
    return array.slice(count)
  }

  /**
   * Drop last n items
   */
  static dropLast<T>(array: T[], count: number): T[] {
    return array.slice(0, -count)
  }

  /**
   * Rotate array
   */
  static rotate<T>(array: T[], count: number): T[] {
    const len = array.length
    const n = ((count % len) + len) % len
    return [...array.slice(n), ...array.slice(0, n)]
  }

  /**
   * Check if arrays are equal
   */
  static equals<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false
    return a.every((val, i) => val === b[i])
  }

  /**
   * Pluck property from array of objects
   */
  static pluck<T, K extends keyof T>(array: T[], key: K): T[K][] {
    return array.map(item => item[key])
  }
}
