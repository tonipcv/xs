/**
 * Pagination Helper Tests
 */

import { describe, it, expect } from 'vitest'
import { PaginationHelper } from '@/lib/helpers/pagination-helper'

describe('Pagination Helper', () => {
  describe('parseParams', () => {
    it('should parse pagination params', () => {
      const params = new URLSearchParams('page=2&limit=50')
      const result = PaginationHelper.parseParams(params)
      
      expect(result.page).toBe(2)
      expect(result.limit).toBe(50)
    })

    it('should use defaults', () => {
      const params = new URLSearchParams()
      const result = PaginationHelper.parseParams(params)
      
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('should limit max limit', () => {
      const params = new URLSearchParams('limit=200')
      const result = PaginationHelper.parseParams(params)
      
      expect(result.limit).toBe(100)
    })
  })

  describe('createResult', () => {
    it('should create pagination result', () => {
      const data = [1, 2, 3, 4, 5]
      const result = PaginationHelper.createResult(data, 100, 1, 20)
      
      expect(result.data).toEqual(data)
      expect(result.pagination.total).toBe(100)
      expect(result.pagination.totalPages).toBe(5)
      expect(result.pagination.hasNext).toBe(true)
      expect(result.pagination.hasPrev).toBe(false)
    })
  })

  describe('getOffset', () => {
    it('should calculate offset', () => {
      expect(PaginationHelper.getOffset(1, 20)).toBe(0)
      expect(PaginationHelper.getOffset(2, 20)).toBe(20)
      expect(PaginationHelper.getOffset(3, 20)).toBe(40)
    })
  })

  describe('encodeCursor / decodeCursor', () => {
    it('should encode and decode cursor', () => {
      const value = 'test-cursor-123'
      const encoded = PaginationHelper.encodeCursor(value)
      const decoded = PaginationHelper.decodeCursor(encoded)
      
      expect(decoded).toBe(value)
    })
  })

  describe('getPageRange', () => {
    it('should get page range', () => {
      const range = PaginationHelper.getPageRange(5, 10, 5)
      
      expect(range).toEqual([3, 4, 5, 6, 7])
    })

    it('should handle first pages', () => {
      const range = PaginationHelper.getPageRange(1, 10, 5)
      
      expect(range).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle last pages', () => {
      const range = PaginationHelper.getPageRange(10, 10, 5)
      
      expect(range).toEqual([6, 7, 8, 9, 10])
    })
  })

  describe('validate', () => {
    it('should validate valid params', () => {
      const result = PaginationHelper.validate({ page: 1, limit: 20 })
      
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid page', () => {
      const result = PaginationHelper.validate({ page: 0, limit: 20 })
      
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject invalid limit', () => {
      const result = PaginationHelper.validate({ page: 1, limit: 200 })
      
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('calculateTotalPages', () => {
    it('should calculate total pages', () => {
      expect(PaginationHelper.calculateTotalPages(100, 20)).toBe(5)
      expect(PaginationHelper.calculateTotalPages(95, 20)).toBe(5)
      expect(PaginationHelper.calculateTotalPages(101, 20)).toBe(6)
    })
  })

  describe('hasNextPage / hasPrevPage', () => {
    it('should check next page', () => {
      expect(PaginationHelper.hasNextPage(1, 5)).toBe(true)
      expect(PaginationHelper.hasNextPage(5, 5)).toBe(false)
    })

    it('should check prev page', () => {
      expect(PaginationHelper.hasPrevPage(1)).toBe(false)
      expect(PaginationHelper.hasPrevPage(2)).toBe(true)
    })
  })
})
