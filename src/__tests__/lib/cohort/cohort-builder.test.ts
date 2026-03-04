/**
 * Cohort Builder Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CohortBuilder } from '@/lib/cohort/cohort-builder'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dataAsset: {
      count: vi.fn(),
    },
  },
}))

describe('Cohort Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildCohort', () => {
    it('should build cohort with simple criteria', async () => {
      vi.mocked(prisma.dataAsset.count).mockResolvedValue(100)

      const definition = {
        name: 'English Speakers',
        description: 'All English language recordings',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
              dataType: 'string' as const,
            },
          ],
        },
      }

      const result = await CohortBuilder.buildCohort(definition)

      expect(result.name).toBe('English Speakers')
      expect(result.matchCount).toBe(100)
      expect(result.cohortId).toMatch(/^cohort_/)
    })

    it('should build cohort with complex nested criteria', async () => {
      vi.mocked(prisma.dataAsset.count).mockResolvedValue(50)

      const definition = {
        name: 'High Quality English',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
            },
            {
              operator: 'AND' as const,
              conditions: [
                {
                  field: 'snr',
                  operator: 'greater_than' as const,
                  value: 20,
                },
                {
                  field: 'speechRatio',
                  operator: 'greater_than' as const,
                  value: 0.7,
                },
              ],
            },
          ],
        },
      }

      const result = await CohortBuilder.buildCohort(definition)

      expect(result.matchCount).toBe(50)
    })

    it('should reject invalid criteria', async () => {
      const definition = {
        name: 'Invalid Cohort',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'INVALID' as any,
          conditions: [],
        },
      }

      await expect(CohortBuilder.buildCohort(definition)).rejects.toThrow('Invalid logical operator')
    })
  })

  describe('templates', () => {
    it('should create age range template', () => {
      const criteria = CohortBuilder.templates.ageRange(18, 65)

      expect(criteria.operator).toBe('AND')
      expect(criteria.conditions).toHaveLength(1)
      expect(criteria.conditions[0]).toMatchObject({
        field: 'age',
        operator: 'between',
        value: [18, 65],
      })
    })

    it('should create language template', () => {
      const criteria = CohortBuilder.templates.language(['en-US', 'pt-BR'])

      expect(criteria.operator).toBe('AND')
      expect(criteria.conditions[0]).toMatchObject({
        field: 'language',
        operator: 'in',
        value: ['en-US', 'pt-BR'],
      })
    })

    it('should create quality threshold template', () => {
      const criteria = CohortBuilder.templates.qualityThreshold(20, 0.7)

      expect(criteria.conditions).toHaveLength(2)
      expect(criteria.conditions[0]).toMatchObject({
        field: 'snr',
        operator: 'greater_than',
        value: 20,
      })
      expect(criteria.conditions[1]).toMatchObject({
        field: 'speechRatio',
        operator: 'greater_than',
        value: 0.7,
      })
    })

    it('should create consent verified template', () => {
      const criteria = CohortBuilder.templates.consentVerified()

      expect(criteria.conditions[0]).toMatchObject({
        field: 'consentStatus',
        operator: 'equals',
        value: 'VERIFIED_BY_XASE',
      })
    })

    it('should combine multiple templates', () => {
      const age = CohortBuilder.templates.ageRange(18, 65)
      const language = CohortBuilder.templates.language(['en-US'])
      const quality = CohortBuilder.templates.qualityThreshold(20, 0.7)

      const combined = CohortBuilder.templates.combine('AND', age, language, quality)

      expect(combined.operator).toBe('AND')
      expect(combined.conditions).toHaveLength(3)
    })
  })

  describe('validateDefinition', () => {
    it('should validate correct definition', async () => {
      const definition = {
        name: 'Valid Cohort',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
            },
          ],
        },
      }

      const result = await CohortBuilder.validateDefinition(definition)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing name', async () => {
      const definition = {
        name: '',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
            },
          ],
        },
      }

      const result = await CohortBuilder.validateDefinition(definition)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Cohort name is required')
    })

    it('should detect missing tenant ID', async () => {
      const definition = {
        name: 'Test',
        tenantId: '',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
            },
          ],
        },
      }

      const result = await CohortBuilder.validateDefinition(definition)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Tenant ID is required')
    })

    it('should warn about unknown fields', async () => {
      const definition = {
        name: 'Test',
        tenantId: 'tenant_123',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'unknownField',
              operator: 'equals' as const,
              value: 'test',
            },
          ],
        },
      }

      const result = await CohortBuilder.validateDefinition(definition)

      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('unknownField')
    })
  })

  describe('export/import', () => {
    it('should export cohort definition to JSON', () => {
      const cohort = {
        cohortId: 'cohort_123',
        name: 'Test Cohort',
        description: 'Test description',
        criteria: {
          operator: 'AND' as const,
          conditions: [
            {
              field: 'language',
              operator: 'equals' as const,
              value: 'en-US',
            },
          ],
        },
        matchCount: 100,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const json = CohortBuilder.exportDefinition(cohort)
      const parsed = JSON.parse(json)

      expect(parsed.name).toBe('Test Cohort')
      expect(parsed.matchCount).toBe(100)
    })

    it('should import cohort definition from JSON', () => {
      const json = JSON.stringify({
        name: 'Imported Cohort',
        description: 'Imported',
        criteria: {
          operator: 'AND',
          conditions: [
            {
              field: 'language',
              operator: 'equals',
              value: 'en-US',
            },
          ],
        },
      })

      const definition = CohortBuilder.importDefinition(json, 'tenant_123')

      expect(definition.name).toBe('Imported Cohort')
      expect(definition.tenantId).toBe('tenant_123')
      expect(definition.criteria.conditions).toHaveLength(1)
    })
  })

  describe('operator conversions', () => {
    it('should handle all supported operators', async () => {
      vi.mocked(prisma.dataAsset.count).mockResolvedValue(0)

      const operators: Array<{ operator: any; value: any }> = [
        { operator: 'equals', value: 'test' },
        { operator: 'not_equals', value: 'test' },
        { operator: 'contains', value: 'test' },
        { operator: 'not_contains', value: 'test' },
        { operator: 'greater_than', value: 10 },
        { operator: 'less_than', value: 10 },
        { operator: 'between', value: [1, 10] },
        { operator: 'in', value: ['a', 'b'] },
        { operator: 'not_in', value: ['a', 'b'] },
        { operator: 'is_null', value: null },
        { operator: 'is_not_null', value: null },
      ]

      for (const { operator, value } of operators) {
        const definition = {
          name: `Test ${operator}`,
          tenantId: 'tenant_123',
          criteria: {
            operator: 'AND' as const,
            conditions: [
              {
                field: 'testField',
                operator: operator as any,
                value,
              },
            ],
          },
        }

        await expect(CohortBuilder.buildCohort(definition)).resolves.toBeDefined()
      }
    })
  })
})
