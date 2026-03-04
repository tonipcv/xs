/**
 * Input Validator Tests
 * Comprehensive validation testing
 */

import { describe, it, expect } from 'vitest'
import {
  validateTenantId,
  validateDatasetId,
  validateLeaseId,
  validatePolicyId,
  validateApiKey,
  validatePrice,
  validateStorageBytes,
  validateIpAddress,
  validateWebhookUrl,
  sanitizeTenantId,
  sanitizeString,
  validateJsonString,
  safeValidate,
  TenantIdSchema,
  PriceSchema,
  CreatePolicySchema,
  PaginationSchema,
  DateRangeSchema,
} from '@/lib/validation/input-validator'

describe('Input Validator', () => {
  describe('Tenant ID Validation', () => {
    it('should accept valid tenant IDs', () => {
      expect(validateTenantId('tenant_123')).toBe('tenant_123')
      expect(validateTenantId('tenant-abc-def')).toBe('tenant-abc-def')
      expect(validateTenantId('TENANT_XYZ')).toBe('TENANT_XYZ')
    })

    it('should reject invalid tenant IDs', () => {
      expect(() => validateTenantId('')).toThrow('Tenant ID is required')
      expect(() => validateTenantId('tenant@invalid')).toThrow('Tenant ID cannot contain @ or spaces')
      expect(() => validateTenantId('tenant with spaces')).toThrow('Invalid tenant ID format')
      expect(() => validateTenantId('tenant#123')).toThrow('Invalid tenant ID format')
    })

    it('should sanitize tenant IDs', () => {
      expect(sanitizeTenantId('  TENANT_123  ')).toBe('tenant_123')
      expect(sanitizeTenantId('Tenant-ABC')).toBe('tenant-abc')
    })
  })

  describe('Dataset ID Validation', () => {
    it('should accept valid dataset IDs', () => {
      expect(validateDatasetId('dataset_123')).toBe('dataset_123')
      expect(validateDatasetId('ds-abc-def')).toBe('ds-abc-def')
    })

    it('should reject invalid dataset IDs', () => {
      expect(() => validateDatasetId('')).toThrow('Dataset ID is required')
      expect(() => validateDatasetId('dataset@123')).toThrow('Invalid dataset ID format')
    })
  })

  describe('Lease ID Validation', () => {
    it('should accept valid lease IDs', () => {
      expect(validateLeaseId('lease_abc123')).toBe('lease_abc123')
      expect(validateLeaseId('lease_XYZ789')).toBe('lease_XYZ789')
    })

    it('should reject invalid lease IDs', () => {
      expect(() => validateLeaseId('')).toThrow('Lease ID is required')
      expect(() => validateLeaseId('invalid_123')).toThrow('Lease ID must start with lease_')
      expect(() => validateLeaseId('lease_')).toThrow('Lease ID must start with lease_')
    })
  })

  describe('Policy ID Validation', () => {
    it('should accept valid policy IDs', () => {
      expect(validatePolicyId('policy_abc123')).toBe('policy_abc123')
      expect(validatePolicyId('policy_XYZ789')).toBe('policy_XYZ789')
    })

    it('should reject invalid policy IDs', () => {
      expect(() => validatePolicyId('')).toThrow('Policy ID is required')
      expect(() => validatePolicyId('invalid_123')).toThrow('Policy ID must start with policy_')
    })
  })

  describe('API Key Validation', () => {
    it('should accept valid API keys', () => {
      const validKey = 'xase_' + 'a'.repeat(32)
      expect(validateApiKey(validKey)).toBe(validKey)
    })

    it('should reject invalid API keys', () => {
      expect(() => validateApiKey('')).toThrow('API key is required')
      expect(() => validateApiKey('invalid_key')).toThrow('Invalid API key format')
      expect(() => validateApiKey('xase_short')).toThrow('Invalid API key format')
    })
  })

  describe('Price Validation', () => {
    it('should accept valid prices', () => {
      expect(validatePrice(0)).toBe(0)
      expect(validatePrice(10.50)).toBe(10.50)
      expect(validatePrice(999999)).toBe(999999)
    })

    it('should reject invalid prices', () => {
      expect(() => validatePrice(-1)).toThrow('Price must be non-negative')
      expect(() => validatePrice(1000001)).toThrow('Price exceeds maximum allowed')
      expect(() => validatePrice(Infinity)).toThrow('Price must be a finite number')
      expect(() => validatePrice(NaN)).toThrow()
    })
  })

  describe('Storage Bytes Validation', () => {
    it('should accept valid storage bytes', () => {
      expect(validateStorageBytes(BigInt(0))).toBe(BigInt(0))
      expect(validateStorageBytes(BigInt(1000))).toBe(BigInt(1000))
      expect(validateStorageBytes(BigInt('9007199254740991'))).toBe(BigInt('9007199254740991'))
    })

    it('should reject invalid storage bytes', () => {
      expect(() => validateStorageBytes(BigInt(-1))).toThrow('Storage bytes must be non-negative')
      expect(() => validateStorageBytes(BigInt('9007199254740992'))).toThrow('Storage bytes exceeds safe integer')
    })
  })

  describe('IP Address Validation', () => {
    it('should accept valid IP addresses', () => {
      expect(validateIpAddress('192.168.1.1')).toBe('192.168.1.1')
      expect(validateIpAddress('10.0.0.1')).toBe('10.0.0.1')
      expect(validateIpAddress('255.255.255.255')).toBe('255.255.255.255')
      expect(validateIpAddress('unknown')).toBe('unknown')
    })

    it('should reject invalid IP addresses', () => {
      expect(() => validateIpAddress('256.1.1.1')).toThrow('Invalid IP address format')
      expect(() => validateIpAddress('192.168.1')).toThrow('Invalid IP address format')
      expect(() => validateIpAddress('not-an-ip')).toThrow('Invalid IP address format')
    })
  })

  describe('Webhook URL Validation', () => {
    it('should accept valid webhook URLs', () => {
      expect(validateWebhookUrl('https://example.com/webhook')).toBe('https://example.com/webhook')
      expect(validateWebhookUrl('https://api.example.com/v1/webhook')).toBe('https://api.example.com/v1/webhook')
    })

    it('should reject invalid webhook URLs', () => {
      expect(() => validateWebhookUrl('http://example.com/webhook')).toThrow('Webhook URL must use HTTPS')
      expect(() => validateWebhookUrl('https://localhost/webhook')).toThrow('Webhook URL cannot be localhost')
      expect(() => validateWebhookUrl('https://127.0.0.1/webhook')).toThrow('Webhook URL cannot be localhost')
      expect(() => validateWebhookUrl('not-a-url')).toThrow('Invalid webhook URL')
    })
  })

  describe('Safe Validation', () => {
    it('should return success for valid data', () => {
      const result = safeValidate(TenantIdSchema, 'tenant_123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('tenant_123')
      }
    })

    it('should return errors for invalid data', () => {
      const result = safeValidate(TenantIdSchema, 'tenant@invalid')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Complex Schema Validation', () => {
    it('should validate create policy schema', () => {
      const validPolicy = {
        datasetId: 'dataset_123',
        clientTenantId: 'tenant_456',
        usagePurpose: 'Research',
        maxHours: 100,
        maxDownloads: 50,
        canStream: true,
        canBatchDownload: false,
      }

      const result = safeValidate(CreatePolicySchema, validPolicy)
      expect(result.success).toBe(true)
    })

    it('should reject invalid create policy schema', () => {
      const invalidPolicy = {
        datasetId: 'invalid@dataset',
        clientTenantId: 'tenant_456',
        usagePurpose: '',
        maxHours: -10,
      }

      const result = safeValidate(CreatePolicySchema, invalidPolicy)
      expect(result.success).toBe(false)
    })
  })

  describe('Pagination Validation', () => {
    it('should apply defaults for pagination', () => {
      const result = PaginationSchema.parse({})
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.sortOrder).toBe('desc')
    })

    it('should validate pagination parameters', () => {
      const result = PaginationSchema.parse({
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      })
      expect(result.page).toBe(2)
      expect(result.limit).toBe(50)
      expect(result.sortOrder).toBe('asc')
    })

    it('should reject invalid pagination', () => {
      expect(() => PaginationSchema.parse({ page: 0 })).toThrow()
      expect(() => PaginationSchema.parse({ limit: 101 })).toThrow()
      expect(() => PaginationSchema.parse({ sortOrder: 'invalid' })).toThrow()
    })
  })

  describe('Date Range Validation', () => {
    it('should accept valid date ranges', () => {
      const result = DateRangeSchema.parse({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
      })
      expect(result.startDate).toBe('2024-01-01T00:00:00Z')
      expect(result.endDate).toBe('2024-01-31T23:59:59Z')
    })

    it('should reject invalid date ranges', () => {
      expect(() => DateRangeSchema.parse({
        startDate: '2024-02-01T00:00:00Z',
        endDate: '2024-01-01T00:00:00Z',
      })).toThrow('Start date must be before or equal to end date')
    })
  })

  describe('String Sanitization', () => {
    it('should sanitize XSS attempts', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script')
      expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
      expect(sanitizeString('<img onerror=alert(1)>')).toBe('img')
    })

    it('should preserve safe strings', () => {
      expect(sanitizeString('  Hello World  ')).toBe('Hello World')
      expect(sanitizeString('Safe-String_123')).toBe('Safe-String_123')
    })
  })

  describe('JSON Validation', () => {
    it('should validate valid JSON strings', () => {
      const result = validateJsonString('{"key": "value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should reject invalid JSON', () => {
      expect(() => validateJsonString('not json')).toThrow('Invalid JSON string')
      expect(() => validateJsonString('null')).toThrow('Invalid JSON')
      expect(() => validateJsonString('123')).toThrow('Invalid JSON')
      expect(() => validateJsonString('"string"')).toThrow('Invalid JSON')
    })
  })

  describe('Price Schema Edge Cases', () => {
    it('should handle decimal precision', () => {
      expect(validatePrice(0.01)).toBe(0.01)
      expect(validatePrice(99.99)).toBe(99.99)
      expect(validatePrice(1000000)).toBe(1000000)
    })

    it('should reject edge cases', () => {
      expect(() => validatePrice(-0.01)).toThrow()
      expect(() => validatePrice(1000000.01)).toThrow()
    })
  })
})
