/**
 * Entity Resolution Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EntityResolution } from '@/lib/entity/entity-resolution'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}))

describe('Entity Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('tokenizeEntity', () => {
    it('should generate deterministic tokens', () => {
      const identifiers = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        ssn: '123-45-6789',
      }

      const result1 = EntityResolution.tokenizeEntity(identifiers)
      const result2 = EntityResolution.tokenizeEntity(identifiers)

      expect(result1.entityToken).toBe(result2.entityToken)
      expect(result1.identifierTokens.ssn).toBe(result2.identifierTokens.ssn)
    })

    it('should handle different identifier combinations', () => {
      const withSSN = EntityResolution.tokenizeEntity({
        ssn: '123-45-6789',
      })

      const withEmail = EntityResolution.tokenizeEntity({
        email: 'john@example.com',
      })

      expect(withSSN.entityToken).not.toBe(withEmail.entityToken)
      expect(withSSN.identifierTokens.ssn).toBeDefined()
      expect(withEmail.identifierTokens.email).toBeDefined()
    })

    it('should normalize inputs consistently', () => {
      const result1 = EntityResolution.tokenizeEntity({
        email: 'John.Doe@Example.COM',
      })

      const result2 = EntityResolution.tokenizeEntity({
        email: 'john.doe@example.com',
      })

      expect(result1.identifierTokens.email).toBe(result2.identifierTokens.email)
    })

    it('should assign HIGH confidence for SSN', () => {
      const result = EntityResolution.tokenizeEntity({
        ssn: '123-45-6789',
      })

      expect(result.confidence).toBe('HIGH')
    })

    it('should assign MEDIUM confidence for name+DOB+email', () => {
      const result = EntityResolution.tokenizeEntity({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        email: 'john@example.com',
      })

      expect(result.confidence).toBe('MEDIUM')
    })

    it('should assign LOW confidence for email only', () => {
      const result = EntityResolution.tokenizeEntity({
        email: 'john@example.com',
      })

      expect(result.confidence).toBe('LOW')
    })
  })

  describe('validateIdentifiers', () => {
    it('should validate correct identifiers', () => {
      const result = EntityResolution.validateIdentifiers({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        ssn: '123-45-6789',
        email: 'john@example.com',
        phone: '+1-555-123-4567',
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject empty identifiers', () => {
      const result = EntityResolution.validateIdentifiers({})

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('At least one identifier must be provided')
    })

    it('should validate SSN format', () => {
      const result = EntityResolution.validateIdentifiers({
        ssn: '123-45',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('SSN must be 9 digits')
    })

    it('should validate email format', () => {
      const result = EntityResolution.validateIdentifiers({
        email: 'invalid-email',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid email format')
    })

    it('should validate phone format', () => {
      const result = EntityResolution.validateIdentifiers({
        phone: '123',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Phone number must be 10-15 digits')
    })

    it('should warn about low confidence identifiers', () => {
      const result = EntityResolution.validateIdentifiers({
        email: 'john@example.com',
      })

      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('Low confidence')
    })
  })

  describe('linkRecords', () => {
    it('should link records with same identifiers', async () => {
      const records = [
        {
          id: 'record1',
          identifiers: {
            ssn: '123-45-6789',
            email: 'john@example.com',
          },
        },
        {
          id: 'record2',
          identifiers: {
            ssn: '123-45-6789',
            email: 'john@example.com',
          },
        },
        {
          id: 'record3',
          identifiers: {
            ssn: '987-65-4321',
            email: 'jane@example.com',
          },
        },
      ]

      const groups = await EntityResolution.linkRecords(records, 'tenant_123')

      expect(groups.size).toBe(2)
      
      const group1 = Array.from(groups.values()).find(g => g.includes('record1'))
      expect(group1).toContain('record1')
      expect(group1).toContain('record2')
      expect(group1).not.toContain('record3')
    })
  })

  describe('calculateMatchScore', () => {
    it('should calculate perfect match score', () => {
      const entity1 = {
        ssn: '123-45-6789',
        email: 'john@example.com',
      }

      const entity2 = {
        ssn: '123-45-6789',
        email: 'john@example.com',
      }

      const score = EntityResolution.calculateMatchScore(entity1, entity2)

      expect(score).toBe(1.0)
    })

    it('should calculate partial match score', () => {
      const entity1 = {
        ssn: '123-45-6789',
        email: 'john@example.com',
      }

      const entity2 = {
        ssn: '123-45-6789',
        email: 'different@example.com',
      }

      const score = EntityResolution.calculateMatchScore(entity1, entity2)

      expect(score).toBe(0.5)
    })

    it('should calculate no match score', () => {
      const entity1 = {
        ssn: '123-45-6789',
      }

      const entity2 = {
        email: 'john@example.com',
      }

      const score = EntityResolution.calculateMatchScore(entity1, entity2)

      expect(score).toBe(0)
    })
  })

  describe('deduplicateEntities', () => {
    it('should identify duplicates', () => {
      const entities = [
        {
          id: 'entity1',
          identifiers: { ssn: '123-45-6789' },
        },
        {
          id: 'entity2',
          identifiers: { ssn: '123-45-6789' },
        },
        {
          id: 'entity3',
          identifiers: { ssn: '987-65-4321' },
        },
      ]

      const duplicates = EntityResolution.deduplicateEntities(entities)

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].primaryId).toBe('entity1')
      expect(duplicates[0].duplicateIds).toContain('entity2')
    })

    it('should return empty array when no duplicates', () => {
      const entities = [
        {
          id: 'entity1',
          identifiers: { ssn: '123-45-6789' },
        },
        {
          id: 'entity2',
          identifiers: { ssn: '987-65-4321' },
        },
      ]

      const duplicates = EntityResolution.deduplicateEntities(entities)

      expect(duplicates).toHaveLength(0)
    })
  })

  describe('anonymize', () => {
    it('should anonymize while preserving linkability', () => {
      const identifiers = {
        firstName: 'John',
        lastName: 'Doe',
        ssn: '123-45-6789',
      }

      const result = EntityResolution.anonymize(identifiers)

      expect(result.anonymizedId).toBeDefined()
      expect(result.anonymizedId.length).toBe(16)
      expect(result.canLink).toBe(true)
      expect(result.preservedFields).toContain('ssn')
    })

    it('should generate same anonymized ID for same identifiers', () => {
      const identifiers = {
        ssn: '123-45-6789',
      }

      const result1 = EntityResolution.anonymize(identifiers)
      const result2 = EntityResolution.anonymize(identifiers)

      expect(result1.anonymizedId).toBe(result2.anonymizedId)
    })
  })

  describe('batchTokenize', () => {
    it('should tokenize multiple entities', () => {
      const entities = [
        { ssn: '123-45-6789' },
        { email: 'john@example.com' },
        { phone: '+1-555-123-4567' },
      ]

      const results = EntityResolution.batchTokenize(entities)

      expect(results).toHaveLength(3)
      expect(results[0].identifierTokens.ssn).toBeDefined()
      expect(results[1].identifierTokens.email).toBeDefined()
      expect(results[2].identifierTokens.phone).toBeDefined()
    })
  })

  describe('generateEntitySummary', () => {
    it('should generate privacy-preserving summary', () => {
      const identifiers = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        ssn: '123-45-6789',
        email: 'john@example.com',
      }

      const summary = EntityResolution.generateEntitySummary(identifiers)

      expect(summary.hasSSN).toBe(true)
      expect(summary.hasEmail).toBe(true)
      expect(summary.hasNameDOB).toBe(true)
      expect(summary.identifierCount).toBe(5)
    })

    it('should handle partial identifiers', () => {
      const identifiers = {
        email: 'john@example.com',
      }

      const summary = EntityResolution.generateEntitySummary(identifiers)

      expect(summary.hasSSN).toBe(false)
      expect(summary.hasEmail).toBe(true)
      expect(summary.identifierCount).toBe(1)
    })
  })

  describe('auditResolution', () => {
    it('should audit entity resolution operation', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any)

      await EntityResolution.auditResolution('tenant_123', 'TOKENIZE', 10, 5)

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant_123',
            action: 'ENTITY_RESOLUTION',
            resourceType: 'ENTITY',
          }),
        })
      )
    })

    it('should handle audit failures gracefully', async () => {
      vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB error'))

      await expect(
        EntityResolution.auditResolution('tenant_123', 'TOKENIZE', 10, 5)
      ).resolves.not.toThrow()
    })
  })
})
