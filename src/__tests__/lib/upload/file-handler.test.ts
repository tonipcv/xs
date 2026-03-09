/**
 * File Handler Tests
 */

import { describe, it, expect } from 'vitest'
import { FileHandler } from '@/lib/upload/file-handler'

describe('File Handler', () => {
  describe('validateFile', () => {
    it('should validate file size', () => {
      const file = new File(['x'.repeat(1000)], 'test.txt', { type: 'text/plain' })
      const result = FileHandler.validateFile(file, { maxSize: 500 })
      
      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds')
    })

    it('should validate file type', () => {
      const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' })
      const result = FileHandler.validateFile(file, {
        allowedTypes: ['image/jpeg', 'image/png'],
      })
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid file type')
    })

    it('should validate file extension', () => {
      const file = new File(['test'], 'test.exe', { type: 'text/plain' })
      const result = FileHandler.validateFile(file, {
        allowedExtensions: ['txt', 'pdf'],
      })
      
      expect(result.valid).toBe(false)
      expect(result.error).toContain('extension')
    })

    it('should pass validation', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const result = FileHandler.validateFile(file, {
        maxSize: 10000,
        allowedTypes: ['text/plain'],
      })
      
      expect(result.valid).toBe(true)
    })
  })

  describe('getFileInfo', () => {
    it('should get file info', () => {
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const info = FileHandler.getFileInfo(file)
      
      expect(info.name).toBe('test.txt')
      expect(info.type).toBe('text/plain')
      expect(info.extension).toBe('.txt')
      expect(info.size).toBeGreaterThan(0)
    })
  })

  describe('isImage', () => {
    it('should detect image', () => {
      const image = new File([''], 'test.jpg', { type: 'image/jpeg' })
      expect(FileHandler.isImage(image)).toBe(true)
    })

    it('should detect non-image', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' })
      expect(FileHandler.isImage(file)).toBe(false)
    })
  })

  describe('isDocument', () => {
    it('should detect PDF', () => {
      const pdf = new File([''], 'test.pdf', { type: 'application/pdf' })
      expect(FileHandler.isDocument(pdf)).toBe(true)
    })
  })
})
