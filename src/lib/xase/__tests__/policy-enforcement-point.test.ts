/**
 * Tests for Policy Enforcement Point (PEP)
 */

import { PolicyEnforcementPoint } from '../policy-enforcement-point'
import { PolicyRewritePlan, XasePolicy } from '../policy-schema'

describe('PolicyEnforcementPoint', () => {
  describe('filterColumns', () => {
    it('should filter columns based on allow list', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: ['name', 'age'],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', age: 30, ssn: '123-45-6789' }
      const filtered = PolicyEnforcementPoint.filterColumns(data, plan)

      expect(filtered).toEqual({ name: 'Alice', age: 30 })
      expect(filtered.ssn).toBeUndefined()
    })

    it('should filter columns based on deny list', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: ['ssn', 'credit_card'],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', age: 30, ssn: '123-45-6789' }
      const filtered = PolicyEnforcementPoint.filterColumns(data, plan)

      expect(filtered).toEqual({ name: 'Alice', age: 30 })
      expect(filtered.ssn).toBeUndefined()
    })

    it('should handle array of objects', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: ['name'],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', ssn: '111' },
        { name: 'Bob', ssn: '222' },
      ]
      const filtered = PolicyEnforcementPoint.filterColumns(data, plan)

      expect(filtered).toHaveLength(2)
    })
  })

  describe('filterRows', () => {
    it('should filter rows based on allow predicates', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [{ field: 'age', op: '>=', value: 18 }],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 15 },
        { name: 'Charlie', age: 30 },
      ]
      const filtered = PolicyEnforcementPoint.filterRows(data, plan)

      expect(filtered).toHaveLength(2)
      expect(filtered[0].name).toBe('Alice')
      expect(filtered[1].name).toBe('Charlie')
    })

    it('should filter rows based on deny predicates', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [{ field: 'status', op: '=', value: 'REVOKED' }],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', status: 'ACTIVE' },
        { name: 'Bob', status: 'REVOKED' },
        { name: 'Charlie', status: 'ACTIVE' },
      ]
      const filtered = PolicyEnforcementPoint.filterRows(data, plan)

      expect(filtered).toHaveLength(2)
      expect(filtered.find(r => r.name === 'Bob')).toBeUndefined()
    })

    it('should support IN operator', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [{ field: 'country', op: 'in', value: ['US', 'CA', 'UK'] }],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', country: 'US' },
        { name: 'Bob', country: 'FR' },
        { name: 'Charlie', country: 'UK' },
      ]
      const filtered = PolicyEnforcementPoint.filterRows(data, plan)

      expect(filtered).toHaveLength(2)
    })
  })

  describe('applyMasking', () => {
    it('should redact columns', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [{ column: 'ssn', method: 'redact' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', ssn: '123-45-6789' }
      const masked = PolicyEnforcementPoint.applyMasking(data, plan)

      expect(masked.ssn).toBe('***REDACTED***')
      expect(masked.name).toBe('Alice')
    })

    it('should hash columns', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [{ column: 'email', method: 'hash' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', email: 'alice@example.com' }
      const masked = PolicyEnforcementPoint.applyMasking(data, plan)

      expect(masked.email).not.toBe('alice@example.com')
      expect(masked.email).toHaveLength(64) // SHA-256 hex
    })

    it('should null columns', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [{ column: 'ssn', method: 'null' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', ssn: '123-45-6789' }
      const masked = PolicyEnforcementPoint.applyMasking(data, plan)

      expect(masked.ssn).toBeNull()
    })

    it('should apply regex masking', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [{ column: 'phone', method: 'regex', regex: '\\d', replace: 'X' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = { name: 'Alice', phone: '555-1234' }
      const masked = PolicyEnforcementPoint.applyMasking(data, plan)

      expect(masked.phone).toBe('XXX-XXXX')
    })

    it('should handle array of objects', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [{ column: 'ssn', method: 'redact' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', ssn: '111' },
        { name: 'Bob', ssn: '222' },
      ]
      const masked = PolicyEnforcementPoint.applyMasking(data, plan)

      expect(masked[0].ssn).toBe('***REDACTED***')
      expect(masked[1].ssn).toBe('***REDACTED***')
    })
  })

  describe('enforce (full pipeline)', () => {
    it('should apply columns + rows + masking', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: ['name', 'age', 'email'],
        deniedColumns: [],
        masks: [{ column: 'email', method: 'hash' }],
        allowRowFilters: [{ field: 'age', op: '>=', value: 18 }],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const data = [
        { name: 'Alice', age: 25, email: 'alice@example.com', ssn: '111' },
        { name: 'Bob', age: 15, email: 'bob@example.com', ssn: '222' },
        { name: 'Charlie', age: 30, email: 'charlie@example.com', ssn: '333' },
      ]

      const enforced = PolicyEnforcementPoint.enforce(data, plan)

      expect(enforced).toHaveLength(2) // Bob filtered out (age < 18)
      expect(enforced[0].ssn).toBeUndefined() // SSN not in allowedColumns
      expect(enforced[0].email).not.toBe('alice@example.com') // Email hashed
      expect(enforced[1].name).toBe('Charlie')
    })
  })

  describe('generateSQLWhereClause', () => {
    it('should generate SQL for allow filters', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [
          { field: 'age', op: '>=', value: 18 },
          { field: 'country', op: '=', value: 'US' },
        ],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const sql = PolicyEnforcementPoint.generateSQLWhereClause(plan)

      expect(sql).toContain('age >= 18')
      expect(sql).toContain("country = 'US'")
      expect(sql).toContain('AND')
    })

    it('should generate SQL for deny filters', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [{ field: 'status', op: '=', value: 'REVOKED' }],
        requiresConsent: true,
      }

      const sql = PolicyEnforcementPoint.generateSQLWhereClause(plan)

      expect(sql).toContain('NOT')
      expect(sql).toContain("status = 'REVOKED'")
    })

    it('should handle IN operator', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [{ field: 'country', op: 'in', value: ['US', 'CA'] }],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const sql = PolicyEnforcementPoint.generateSQLWhereClause(plan)

      expect(sql).toContain('country IN')
      expect(sql).toContain("'US'")
      expect(sql).toContain("'CA'")
    })

    it('should return 1=1 for empty filters', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: [],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const sql = PolicyEnforcementPoint.generateSQLWhereClause(plan)

      expect(sql).toBe('1=1')
    })
  })

  describe('generateSQLSelectColumns', () => {
    it('should generate column list with masking', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: ['name', 'email'],
        deniedColumns: [],
        masks: [{ column: 'email', method: 'hash' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const allColumns = ['name', 'email', 'ssn']
      const sql = PolicyEnforcementPoint.generateSQLSelectColumns(plan, allColumns)

      expect(sql).toContain('name')
      expect(sql).toContain('MD5(email')
      expect(sql).not.toContain('ssn')
    })

    it('should handle deny list', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: [],
        deniedColumns: ['ssn'],
        masks: [],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const allColumns = ['name', 'email', 'ssn']
      const sql = PolicyEnforcementPoint.generateSQLSelectColumns(plan, allColumns)

      expect(sql).toContain('name')
      expect(sql).toContain('email')
      expect(sql).not.toContain('ssn')
    })

    it('should apply redaction', () => {
      const plan: PolicyRewritePlan = {
        datasetId: 'ds_test',
        allowedColumns: ['name', 'ssn'],
        deniedColumns: [],
        masks: [{ column: 'ssn', method: 'redact' }],
        allowRowFilters: [],
        denyRowFilters: [],
        requiresConsent: true,
      }

      const allColumns = ['name', 'ssn']
      const sql = PolicyEnforcementPoint.generateSQLSelectColumns(plan, allColumns)

      expect(sql).toContain("'***REDACTED***' AS ssn")
    })
  })
})
