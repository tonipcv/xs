import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Encryption Service', () => {
  describe('AES-256-GCM Encryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/services/encryption')
      
      const plaintext = 'sensitive_data_12345'
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      
      expect(encrypted).not.toBe(plaintext)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertexts for same plaintext', async () => {
      const { encryptToken } = await import('@/lib/services/encryption')
      
      const plaintext = 'test_data'
      const encrypted1 = encryptToken(plaintext)
      const encrypted2 = encryptToken(plaintext)
      
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('should handle empty strings', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/services/encryption')
      
      const encrypted = encryptToken('')
      const decrypted = decryptToken(encrypted)
      
      expect(decrypted).toBe('')
    })

    it('should handle special characters', async () => {
      const { encryptToken, decryptToken } = await import('@/lib/services/encryption')
      
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      
      expect(decrypted).toBe(plaintext)
    })
  })
})
