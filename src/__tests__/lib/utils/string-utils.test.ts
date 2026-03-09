/**
 * String Utilities Tests
 */

import { describe, it, expect } from 'vitest'
import { StringUtils } from '@/lib/utils/string-utils'

describe('String Utilities', () => {
  describe('truncate', () => {
    it('should truncate long string', () => {
      const result = StringUtils.truncate('Hello World', 8)
      expect(result).toBe('Hello...')
    })

    it('should not truncate short string', () => {
      const result = StringUtils.truncate('Hello', 10)
      expect(result).toBe('Hello')
    })
  })

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      const result = StringUtils.capitalize('hello')
      expect(result).toBe('Hello')
    })
  })

  describe('titleCase', () => {
    it('should convert to title case', () => {
      const result = StringUtils.titleCase('hello world')
      expect(result).toBe('Hello World')
    })
  })

  describe('slugify', () => {
    it('should slugify string', () => {
      const result = StringUtils.slugify('Hello World!')
      expect(result).toBe('hello-world')
    })
  })

  describe('random', () => {
    it('should generate random string', () => {
      const result = StringUtils.random(10)
      expect(result).toHaveLength(10)
    })

    it('should generate numeric string', () => {
      const result = StringUtils.random(5, 'numeric')
      expect(result).toMatch(/^\d{5}$/)
    })
  })

  describe('mask', () => {
    it('should mask string', () => {
      const result = StringUtils.mask('1234567890', 4)
      expect(result).toBe('******7890')
    })
  })

  describe('wordCount', () => {
    it('should count words', () => {
      const result = StringUtils.wordCount('Hello world from tests')
      expect(result).toBe(4)
    })
  })

  describe('isPalindrome', () => {
    it('should detect palindrome', () => {
      expect(StringUtils.isPalindrome('racecar')).toBe(true)
      expect(StringUtils.isPalindrome('hello')).toBe(false)
    })
  })

  describe('stripHtml', () => {
    it('should strip HTML tags', () => {
      const result = StringUtils.stripHtml('<p>Hello <b>World</b></p>')
      expect(result).toBe('Hello World')
    })
  })

  describe('escapeHtml', () => {
    it('should escape HTML', () => {
      const result = StringUtils.escapeHtml('<script>alert("xss")</script>')
      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
    })
  })

  describe('pad', () => {
    it('should pad right', () => {
      const result = StringUtils.pad('Hi', 5, ' ', 'right')
      expect(result).toBe('Hi   ')
    })

    it('should pad left', () => {
      const result = StringUtils.pad('Hi', 5, ' ', 'left')
      expect(result).toBe('   Hi')
    })
  })

  describe('extractNumbers', () => {
    it('should extract numbers', () => {
      const result = StringUtils.extractNumbers('abc123def456')
      expect(result).toEqual([123, 456])
    })
  })

  describe('count', () => {
    it('should count occurrences', () => {
      const result = StringUtils.count('hello hello world', 'hello')
      expect(result).toBe(2)
    })
  })

  describe('levenshtein', () => {
    it('should calculate edit distance', () => {
      const result = StringUtils.levenshtein('kitten', 'sitting')
      expect(result).toBe(3)
    })
  })

  describe('similarity', () => {
    it('should calculate similarity', () => {
      const result = StringUtils.similarity('hello', 'hallo')
      expect(result).toBeGreaterThan(0.5) // Returns 0-1 scale, 0.8 for hello/hallo
    })
  })
})
