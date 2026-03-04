/**
 * COHORT BUILDER
 * Advanced query builder for creating patient/data cohorts with complex criteria
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type CriteriaOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'in' | 'not_in' | 'is_null' | 'is_not_null'

export type LogicalOperator = 'AND' | 'OR' | 'NOT'

export interface CriteriaCondition {
  field: string
  operator: CriteriaOperator
  value: any
  dataType?: 'string' | 'number' | 'date' | 'boolean' | 'array'
}

export interface CriteriaGroup {
  operator: LogicalOperator
  conditions: (CriteriaCondition | CriteriaGroup)[]
}

export interface CohortDefinition {
  name: string
  description?: string
  criteria: CriteriaGroup
  tenantId: string
  datasetId?: string
}

export interface CohortResult {
  cohortId: string
  name: string
  description?: string
  criteria: CriteriaGroup
  matchCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Cohort Builder Service
 */
export class CohortBuilder {
  /**
   * Build a cohort based on criteria
   */
  static async buildCohort(definition: CohortDefinition): Promise<CohortResult> {
    // Validate criteria
    this.validateCriteria(definition.criteria)

    // Convert criteria to Prisma where clause
    const whereClause = this.criteriaToWhere(definition.criteria)

    // Count matches
    const matchCount = await this.countMatches(whereClause, definition.datasetId)

    // Create cohort record (simplified - in production would save to database)
    const cohortId = `cohort_${Date.now()}_${Math.random().toString(36).substring(7)}`

    return {
      cohortId,
      name: definition.name,
      description: definition.description,
      criteria: definition.criteria,
      matchCount,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  /**
   * Validate criteria structure
   */
  private static validateCriteria(criteria: CriteriaGroup): void {
    if (!criteria.operator || !['AND', 'OR', 'NOT'].includes(criteria.operator)) {
      throw new Error('Invalid logical operator')
    }

    if (!Array.isArray(criteria.conditions) || criteria.conditions.length === 0) {
      throw new Error('Criteria must have at least one condition')
    }

    for (const condition of criteria.conditions) {
      if ('operator' in condition && 'conditions' in condition) {
        // Nested group
        this.validateCriteria(condition as CriteriaGroup)
      } else {
        // Single condition
        const cond = condition as CriteriaCondition
        if (!cond.field || !cond.operator) {
          throw new Error('Condition must have field and operator')
        }
      }
    }
  }

  /**
   * Convert criteria to Prisma where clause
   */
  private static criteriaToWhere(criteria: CriteriaGroup): any {
    const conditions = criteria.conditions.map((condition) => {
      if ('operator' in condition && 'conditions' in condition) {
        // Nested group
        return this.criteriaToWhere(condition as CriteriaGroup)
      } else {
        // Single condition
        return this.conditionToWhere(condition as CriteriaCondition)
      }
    })

    if (criteria.operator === 'AND') {
      return { AND: conditions }
    } else if (criteria.operator === 'OR') {
      return { OR: conditions }
    } else if (criteria.operator === 'NOT') {
      return { NOT: conditions }
    }

    return {}
  }

  /**
   * Convert single condition to Prisma where clause
   */
  private static conditionToWhere(condition: CriteriaCondition): any {
    const { field, operator, value } = condition

    switch (operator) {
      case 'equals':
        return { [field]: { equals: value } }
      
      case 'not_equals':
        return { [field]: { not: value } }
      
      case 'contains':
        return { [field]: { contains: value, mode: 'insensitive' } }
      
      case 'not_contains':
        return { NOT: { [field]: { contains: value, mode: 'insensitive' } } }
      
      case 'greater_than':
        return { [field]: { gt: value } }
      
      case 'less_than':
        return { [field]: { lt: value } }
      
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Between operator requires array of 2 values')
        }
        return { [field]: { gte: value[0], lte: value[1] } }
      
      case 'in':
        if (!Array.isArray(value)) {
          throw new Error('In operator requires array value')
        }
        return { [field]: { in: value } }
      
      case 'not_in':
        if (!Array.isArray(value)) {
          throw new Error('Not in operator requires array value')
        }
        return { [field]: { notIn: value } }
      
      case 'is_null':
        return { [field]: null }
      
      case 'is_not_null':
        return { [field]: { not: null } }
      
      default:
        throw new Error(`Unsupported operator: ${operator}`)
    }
  }

  /**
   * Count matches for criteria
   */
  private static async countMatches(whereClause: any, datasetId?: string): Promise<number> {
    // In production, this would query the actual data
    // For now, we'll query DataAssets as a proxy
    const where = datasetId
      ? { ...whereClause, datasetId }
      : whereClause

    try {
      const count = await prisma.dataAsset.count({ where })
      return count
    } catch (error) {
      console.error('[CohortBuilder] Error counting matches:', error)
      return 0
    }
  }

  /**
   * Execute cohort query and get results
   */
  static async executeCohort(
    cohortId: string,
    options: {
      page?: number
      limit?: number
      fields?: string[]
    } = {}
  ): Promise<{
    results: any[]
    pagination: {
      page: number
      limit: number
      total: number
    }
  }> {
    // In production, would load cohort definition from database
    // For now, return empty results
    const page = options.page || 1
    const limit = Math.min(options.limit || 20, 100)

    return {
      results: [],
      pagination: {
        page,
        limit,
        total: 0,
      },
    }
  }

  /**
   * Create common cohort templates
   */
  static templates = {
    /**
     * Age range cohort
     */
    ageRange(minAge: number, maxAge: number): CriteriaGroup {
      return {
        operator: 'AND',
        conditions: [
          {
            field: 'age',
            operator: 'between',
            value: [minAge, maxAge],
            dataType: 'number',
          },
        ],
      }
    },

    /**
     * Language cohort
     */
    language(languages: string[]): CriteriaGroup {
      return {
        operator: 'AND',
        conditions: [
          {
            field: 'language',
            operator: 'in',
            value: languages,
            dataType: 'array',
          },
        ],
      }
    },

    /**
     * Date range cohort
     */
    dateRange(field: string, startDate: Date, endDate: Date): CriteriaGroup {
      return {
        operator: 'AND',
        conditions: [
          {
            field,
            operator: 'between',
            value: [startDate, endDate],
            dataType: 'date',
          },
        ],
      }
    },

    /**
     * Quality threshold cohort
     */
    qualityThreshold(minSnr: number, minSpeechRatio: number): CriteriaGroup {
      return {
        operator: 'AND',
        conditions: [
          {
            field: 'snr',
            operator: 'greater_than',
            value: minSnr,
            dataType: 'number',
          },
          {
            field: 'speechRatio',
            operator: 'greater_than',
            value: minSpeechRatio,
            dataType: 'number',
          },
        ],
      }
    },

    /**
     * Consent verified cohort
     */
    consentVerified(): CriteriaGroup {
      return {
        operator: 'AND',
        conditions: [
          {
            field: 'consentStatus',
            operator: 'equals',
            value: 'VERIFIED_BY_XASE',
            dataType: 'string',
          },
        ],
      }
    },

    /**
     * Multi-criteria cohort (combine multiple templates)
     */
    combine(operator: LogicalOperator, ...groups: CriteriaGroup[]): CriteriaGroup {
      return {
        operator,
        conditions: groups,
      }
    },
  }

  /**
   * Validate cohort definition before execution
   */
  static async validateDefinition(definition: CohortDefinition): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Validate criteria structure
      this.validateCriteria(definition.criteria)

      // Check if cohort name is provided
      if (!definition.name || definition.name.trim().length === 0) {
        errors.push('Cohort name is required')
      }

      // Check if tenant ID is provided
      if (!definition.tenantId) {
        errors.push('Tenant ID is required')
      }

      // Validate field names exist in schema
      const fields = this.extractFields(definition.criteria)
      const validFields = ['language', 'snr', 'speechRatio', 'age', 'consentStatus', 'dataType']
      
      for (const field of fields) {
        if (!validFields.includes(field)) {
          warnings.push(`Field '${field}' may not exist in schema`)
        }
      }

      // Check for empty criteria
      if (definition.criteria.conditions.length === 0) {
        errors.push('Criteria must have at least one condition')
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings,
      }
    }
  }

  /**
   * Extract all field names from criteria
   */
  private static extractFields(criteria: CriteriaGroup): string[] {
    const fields: string[] = []

    for (const condition of criteria.conditions) {
      if ('operator' in condition && 'conditions' in condition) {
        // Nested group
        fields.push(...this.extractFields(condition as CriteriaGroup))
      } else {
        // Single condition
        const cond = condition as CriteriaCondition
        if (cond.field) {
          fields.push(cond.field)
        }
      }
    }

    return fields
  }

  /**
   * Get cohort statistics
   */
  static async getCohortStats(cohortId: string): Promise<{
    totalRecords: number
    byLanguage: Record<string, number>
    byConsentStatus: Record<string, number>
    avgQuality: {
      snr: number
      speechRatio: number
    }
  }> {
    // In production, would calculate from actual cohort data
    return {
      totalRecords: 0,
      byLanguage: {},
      byConsentStatus: {},
      avgQuality: {
        snr: 0,
        speechRatio: 0,
      },
    }
  }

  /**
   * Export cohort definition to JSON
   */
  static exportDefinition(cohort: CohortResult): string {
    return JSON.stringify(
      {
        name: cohort.name,
        description: cohort.description,
        criteria: cohort.criteria,
        matchCount: cohort.matchCount,
        createdAt: cohort.createdAt,
      },
      null,
      2
    )
  }

  /**
   * Import cohort definition from JSON
   */
  static importDefinition(json: string, tenantId: string): CohortDefinition {
    const parsed = JSON.parse(json)
    
    return {
      name: parsed.name,
      description: parsed.description,
      criteria: parsed.criteria,
      tenantId,
    }
  }
}
