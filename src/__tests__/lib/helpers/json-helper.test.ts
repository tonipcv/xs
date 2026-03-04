/**
 * JSON Helper Tests
 */

import { describe, it, expect } from 'vitest'
import { JsonHelper } from '@/lib/helpers/json-helper'

describe('JSON Helper', () => {
  describe('safeParse', () => {
    it('should parse valid JSON', () => {
      const result = JsonHelper.safeParse('{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should return null for invalid JSON', () => {
      const result = JsonHelper.safeParse('invalid json')
      expect(result).toBeNull()
    })

    it('should return default value', () => {
      const result = JsonHelper.safeParse('invalid', { default: true })
      expect(result).toEqual({ default: true })
    })
  })

  describe('safeStringify', () => {
    it('should stringify object', () => {
      const result = JsonHelper.safeStringify({ key: 'value' })
      expect(result).toBe('{"key":"value"}')
    })

    it('should pretty print', () => {
      const result = JsonHelper.safeStringify({ key: 'value' }, true)
      expect(result).toContain('\n')
    })
  })

  describe('clone', () => {
    it('should deep clone object', () => {
      const original = { a: { b: { c: 1 } } }
      const cloned = JsonHelper.clone(original)
      
      cloned.a.b.c = 2
      
      expect(original.a.b.c).toBe(1)
      expect(cloned.a.b.c).toBe(2)
    })
  })

  describe('isValid', () => {
    it('should validate JSON', () => {
      expect(JsonHelper.isValid('{"key":"value"}')).toBe(true)
      expect(JsonHelper.isValid('invalid')).toBe(false)
    })
  })

  describe('flatten / unflatten', () => {
    it('should flatten object', () => {
      const obj = { a: { b: { c: 1 } } }
      const flattened = JsonHelper.flatten(obj)
      
      expect(flattened).toEqual({ 'a.b.c': 1 })
    })

    it('should unflatten object', () => {
      const flattened = { 'a.b.c': 1 }
      const unflattened = JsonHelper.unflatten(flattened)
      
      expect(unflattened).toEqual({ a: { b: { c: 1 } } })
    })
  })

  describe('equals', () => {
    it('should compare objects', () => {
      const a = { x: 1, y: 2 }
      const b = { x: 1, y: 2 }
      const c = { x: 1, y: 3 }
      
      expect(JsonHelper.equals(a, b)).toBe(true)
      expect(JsonHelper.equals(a, c)).toBe(false)
    })
  })

  describe('diff', () => {
    it('should find differences', () => {
      const a = { x: 1, y: 2, z: 3 }
      const b = { x: 1, y: 3, z: 3 }
      
      const diff = JsonHelper.diff(a, b)
      
      expect(diff.y).toEqual({ old: 2, new: 3 })
      expect(diff.x).toBeUndefined()
    })
  })

  describe('compact', () => {
    it('should remove null/undefined', () => {
      const obj = { a: 1, b: null, c: undefined, d: 2 }
      const compacted = JsonHelper.compact(obj)
      
      expect(compacted).toEqual({ a: 1, d: 2 })
    })
  })

  describe('get / set', () => {
    it('should get nested value', () => {
      const obj = { a: { b: { c: 1 } } }
      const value = JsonHelper.get(obj, 'a.b.c')
      
      expect(value).toBe(1)
    })

    it('should set nested value', () => {
      const obj = {}
      JsonHelper.set(obj, 'a.b.c', 1)
      
      expect(obj).toEqual({ a: { b: { c: 1 } } })
    })

    it('should return default value', () => {
      const obj = { a: 1 }
      const value = JsonHelper.get(obj, 'b.c', 'default')
      
      expect(value).toBe('default')
    })
  })
})
