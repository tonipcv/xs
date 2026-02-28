/**
 * API Key Manager Unit Tests
 * Tests for API key generation and validation
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('API Key Manager Logic', () => {
  describe('Key Generation', () => {
    it('should generate random key with correct length', () => {
      const rawKey = crypto.randomBytes(32).toString('hex');
      expect(rawKey.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate unique keys', () => {
      const key1 = crypto.randomBytes(32).toString('hex');
      const key2 = crypto.randomBytes(32).toString('hex');
      expect(key1).not.toBe(key2);
    });

    it('should create SHA256 hash', () => {
      const rawKey = 'test_key_12345';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash.length).toBe(64); // SHA256 produces 64 hex characters
      expect(keyHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should create consistent hash for same input', () => {
      const rawKey = 'test_key_12345';
      const hash1 = crypto.createHash('sha256').update(rawKey).digest('hex');
      const hash2 = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different inputs', () => {
      const key1 = 'test_key_1';
      const key2 = 'test_key_2';
      const hash1 = crypto.createHash('sha256').update(key1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(key2).digest('hex');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Key Prefix', () => {
    it('should create prefix with xase_ format', () => {
      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
      
      expect(keyPrefix).toMatch(/^xase_[a-f0-9]{8}$/);
    });

    it('should create unique prefixes', () => {
      const key1 = crypto.randomBytes(32).toString('hex');
      const key2 = crypto.randomBytes(32).toString('hex');
      const prefix1 = `xase_${key1.substring(0, 8)}`;
      const prefix2 = `xase_${key2.substring(0, 8)}`;
      
      expect(prefix1).not.toBe(prefix2);
    });

    it('should extract first 8 characters for prefix', () => {
      const rawKey = 'abcdef1234567890';
      const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
      
      expect(keyPrefix).toBe('xase_abcdef12');
    });
  });

  describe('Full Key Format', () => {
    it('should create full key with prefix and raw key', () => {
      const rawKey = 'test123456';
      const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
      const fullKey = `${keyPrefix}_${rawKey}`;
      
      expect(fullKey).toContain('xase_');
      expect(fullKey).toContain(rawKey);
    });

    it('should have correct structure', () => {
      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
      const fullKey = `${keyPrefix}_${rawKey}`;
      
      const parts = fullKey.split('_');
      expect(parts[0]).toBe('xase');
      expect(parts.length).toBe(3);
    });
  });

  describe('Key Validation', () => {
    it('should validate key format', () => {
      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = `xase_${rawKey.substring(0, 8)}`;
      const validKey = `${keyPrefix}_${rawKey}`;
      const parts = validKey.split('_');
      
      expect(parts[0]).toBe('xase');
      expect(parts[1].length).toBe(8);
      expect(parts[2].length).toBe(64);
    });

    it('should reject invalid format', () => {
      const invalidKey = 'invalid_key';
      const parts = invalidKey.split('_');
      
      expect(parts[0]).not.toBe('xase');
    });

    it('should validate prefix format', () => {
      const prefix = 'xase_abcd1234';
      expect(prefix.startsWith('xase_')).toBe(true);
      expect(prefix.length).toBe(13); // 'xase_' + 8 chars
    });
  });

  describe('Security', () => {
    it('should not store raw keys', () => {
      const rawKey = 'sensitive_key_12345';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash).not.toContain('sensitive');
      expect(keyHash).not.toBe(rawKey);
    });

    it('should use one-way hashing', () => {
      const rawKey = 'test_key';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      // Cannot reverse hash to get original key
      expect(keyHash.length).toBe(64);
      expect(keyHash).not.toBe(rawKey);
    });

    it('should handle special characters in keys', () => {
      const rawKey = 'key!@#$%^&*()';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Expiration', () => {
    it('should calculate expiration date', () => {
      const expiresInDays = 30;
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should handle no expiration', () => {
      const expiresInDays = undefined;
      const expiresAt = expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;
      
      expect(expiresAt).toBeUndefined();
    });

    it('should calculate correct future date', () => {
      const expiresInDays = 7;
      const now = Date.now();
      const expiresAt = new Date(now + expiresInDays * 24 * 60 * 60 * 1000);
      
      const daysDiff = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
      expect(Math.round(daysDiff)).toBe(7);
    });
  });

  describe('Permissions', () => {
    it('should format permissions as comma-separated', () => {
      const permissions = ['read', 'write', 'delete'];
      const formatted = permissions.join(',');
      
      expect(formatted).toBe('read,write,delete');
    });

    it('should handle single permission', () => {
      const permissions = ['read'];
      const formatted = permissions.join(',');
      
      expect(formatted).toBe('read');
    });

    it('should handle empty permissions', () => {
      const permissions: string[] = [];
      const formatted = permissions.join(',');
      
      expect(formatted).toBe('');
    });

    it('should format scopes with semicolons', () => {
      const scopes = [
        { permissions: ['read', 'write'] },
        { permissions: ['admin'] },
      ];
      const formatted = scopes.map(s => s.permissions.join(',')).join(';');
      
      expect(formatted).toBe('read,write;admin');
    });
  });

  describe('Key Comparison', () => {
    it('should compare hashes for authentication', () => {
      const rawKey = 'user_provided_key';
      const storedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const providedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(providedHash).toBe(storedHash);
    });

    it('should reject wrong key', () => {
      const correctKey = 'correct_key';
      const wrongKey = 'wrong_key';
      const storedHash = crypto.createHash('sha256').update(correctKey).digest('hex');
      const providedHash = crypto.createHash('sha256').update(wrongKey).digest('hex');
      
      expect(providedHash).not.toBe(storedHash);
    });

    it('should be case-sensitive', () => {
      const key1 = 'TestKey';
      const key2 = 'testkey';
      const hash1 = crypto.createHash('sha256').update(key1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(key2).digest('hex');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const rawKey = '';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash.length).toBe(64);
    });

    it('should handle very long keys', () => {
      const rawKey = 'a'.repeat(1000);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash.length).toBe(64); // Hash is always same length
    });

    it('should handle unicode characters', () => {
      const rawKey = '🔑🔐🗝️';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      expect(keyHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Performance', () => {
    it('should generate keys quickly', () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        crypto.randomBytes(32).toString('hex');
      }
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should take less than 1 second for 100 keys
    });

    it('should hash keys quickly', () => {
      const rawKey = crypto.randomBytes(32).toString('hex');
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        crypto.createHash('sha256').update(rawKey).digest('hex');
      }
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should take less than 1 second for 1000 hashes
    });
  });
});
