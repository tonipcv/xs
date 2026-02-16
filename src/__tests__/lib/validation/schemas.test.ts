import { describe, it, expect } from 'vitest'

describe('Validation Schemas', () => {
  describe('Dataset Schema', () => {
    it('should validate correct dataset data', async () => {
      const { CreateDatasetSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        name: 'Test Dataset',
        language: 'en-US',
        description: 'Test description',
      }
      
      const result = CreateDatasetSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject dataset without name', async () => {
      const { CreateDatasetSchema } = await import('@/lib/validation/schemas')
      
      const invalidData = {
        language: 'en-US',
      }
      
      const result = CreateDatasetSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should validate integration modes', async () => {
      const { CreateDatasetSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        name: 'Test',
        language: 'en-US',
        integrationMode: 'aws-s3' as const,
      }
      
      const result = CreateDatasetSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('API Key Schema', () => {
    it('should validate correct OTP confirmation', async () => {
      const { ConfirmOTPSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        otp: '123456',
        name: 'Production Key',
        permissions: ['ingest', 'export'],
      }
      
      const result = ConfirmOTPSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject invalid OTP length', async () => {
      const { ConfirmOTPSchema } = await import('@/lib/validation/schemas')
      
      const invalidData = {
        otp: '123',
        name: 'Test Key',
      }
      
      const result = ConfirmOTPSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('Lease Schema', () => {
    it('should validate correct lease data', async () => {
      const { CreateLeaseSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        policyId: 'pol_123',
        ttlSeconds: 3600,
      }
      
      const result = CreateLeaseSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject TTL below minimum', async () => {
      const { CreateLeaseSchema } = await import('@/lib/validation/schemas')
      
      const invalidData = {
        policyId: 'pol_123',
        ttlSeconds: 30,
      }
      
      const result = CreateLeaseSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })

    it('should reject TTL above maximum', async () => {
      const { CreateLeaseSchema } = await import('@/lib/validation/schemas')
      
      const invalidData = {
        policyId: 'pol_123',
        ttlSeconds: 86400 * 31,
      }
      
      const result = CreateLeaseSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('Sidecar Schemas', () => {
    it('should validate sidecar auth', async () => {
      const { SidecarAuthSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        leaseId: 'lease_123',
        attestationReport: 'report_data',
      }
      
      const result = SidecarAuthSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should validate telemetry data', async () => {
      const { SidecarTelemetrySchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        sessionId: 'session_123',
        logs: [{
          segmentId: 'seg_123',
          timestamp: new Date().toISOString(),
          eventType: 'download',
          bytesProcessed: 1024,
        }],
      }
      
      const result = SidecarTelemetrySchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject telemetry with too many logs', async () => {
      const { SidecarTelemetrySchema } = await import('@/lib/validation/schemas')
      
      const logs = Array(1001).fill({
        segmentId: 'seg_123',
        timestamp: new Date().toISOString(),
        eventType: 'download',
      })
      
      const invalidData = {
        sessionId: 'session_123',
        logs,
      }
      
      const result = SidecarTelemetrySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  describe('Evidence Schema', () => {
    it('should validate evidence generation request', async () => {
      const { GenerateEvidenceSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        executionId: 'exec_123',
        includeAuditLogs: true,
        includeMerkleTree: true,
      }
      
      const result = GenerateEvidenceSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('Compliance Schemas', () => {
    it('should validate DSAR request', async () => {
      const { DSARRequestSchema } = await import('@/lib/validation/schemas')
      
      const validData = {
        email: 'user@example.com',
        requestType: 'access',
        description: 'I want to access my data',
      }
      
      const result = DSARRequestSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', async () => {
      const { DSARRequestSchema } = await import('@/lib/validation/schemas')
      
      const invalidData = {
        email: 'invalid-email',
        requestType: 'access',
      }
      
      const result = DSARRequestSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })
})
