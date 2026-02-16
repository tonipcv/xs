/**
 * POLICY ENFORCEMENT POINT (PEP)
 * 
 * Middleware que aplica políticas YAML em todas as requisições de dados.
 * Implementa:
 * - Column-level access control (allow/deny)
 * - Row-level filtering (predicates)
 * - Data masking (redact/hash/null/regex)
 * - Consent verification
 * - Environment/validity checks
 */

import { XasePolicy, PolicyRewritePlan } from './policy-schema'
import { evaluateContextAgainstPolicy, buildRewritePlan } from './policy-validator'
import { hashString } from './crypto'

export interface EnforcementContext {
  principal: string
  purpose: string
  environment?: 'production' | 'staging' | 'development'
  consent?: {
    status?: 'VERIFIED_BY_XASE' | 'SELF_DECLARED' | 'PENDING'
    version?: string
    hasProof?: boolean
  }
  now?: Date
}

export interface EnforcementResult {
  allowed: boolean
  reasons: string[]
  plan?: PolicyRewritePlan
  maskedData?: any
}

export class PolicyEnforcementPoint {
  /**
   * Avalia se o acesso é permitido pela política
   */
  static evaluate(
    policy: XasePolicy,
    context: EnforcementContext
  ): EnforcementResult {
    const evaluation = evaluateContextAgainstPolicy(policy, context)
    
    if (!evaluation.allowed) {
      return {
        allowed: false,
        reasons: evaluation.reasons
      }
    }

    const plan = buildRewritePlan(policy)
    
    return {
      allowed: true,
      reasons: [],
      plan
    }
  }

  /**
   * Aplica column filtering em um objeto de dados
   */
  static filterColumns(data: any, plan: PolicyRewritePlan): any {
    if (!data || typeof data !== 'object') return data

    // Se for array, processar cada objeto do array
    if (Array.isArray(data)) {
      return data.map(item => this.filterColumns(item, plan))
    }

    // Se for objeto, filtrar colunas
    const filtered: any = {}
    const allowedSet = new Set(plan.allowedColumns)
    const deniedSet = new Set(plan.deniedColumns)

    for (const [key, value] of Object.entries(data)) {
      // Se há allow list, apenas colunas permitidas passam
      if (plan.allowedColumns.length > 0) {
        if (!allowedSet.has(key)) continue
      }
      
      // Se há deny list, colunas negadas são removidas
      if (deniedSet.has(key)) continue

      filtered[key] = value
    }

    return filtered
  }

  /**
   * Aplica row filtering em um array de dados
   */
  static filterRows(data: any[], plan: PolicyRewritePlan): any[] {
    if (!Array.isArray(data)) return data

    return data.filter(row => {
      // Aplicar allow filters (todos devem passar)
      for (const filter of plan.allowRowFilters) {
        if (!this.evaluateRowPredicate(row, filter)) {
          return false
        }
      }

      // Aplicar deny filters (nenhum deve passar)
      for (const filter of plan.denyRowFilters) {
        if (this.evaluateRowPredicate(row, filter)) {
          return false
        }
      }

      return true
    })
  }

  /**
   * Avalia um predicado de linha
   */
  private static evaluateRowPredicate(
    row: any,
    predicate: { field: string; op: string; value: any }
  ): boolean {
    const fieldValue = row[predicate.field]
    
    switch (predicate.op) {
      case '=':
        return fieldValue === predicate.value
      case '!=':
        return fieldValue !== predicate.value
      case '>':
        return fieldValue > predicate.value
      case '>=':
        return fieldValue >= predicate.value
      case '<':
        return fieldValue < predicate.value
      case '<=':
        return fieldValue <= predicate.value
      case 'in':
        return Array.isArray(predicate.value) && predicate.value.includes(fieldValue)
      case 'not_in':
        return Array.isArray(predicate.value) && !predicate.value.includes(fieldValue)
      default:
        return false
    }
  }

  /**
   * Aplica masking em dados
   */
  static applyMasking(
    data: any,
    plan: PolicyRewritePlan,
    exceptPrincipal?: string
  ): any {
    if (!data || typeof data !== 'object') return data

    const masked = Array.isArray(data) ? [...data] : { ...data }

    for (const mask of plan.masks) {
      // Verificar se o principal está na exceção
      if (exceptPrincipal && (mask as any).except_principals?.includes(exceptPrincipal)) {
        continue
      }

      if (Array.isArray(masked)) {
        for (let i = 0; i < masked.length; i++) {
          if (masked[i] && typeof masked[i] === 'object' && mask.column in masked[i]) {
            masked[i] = { ...masked[i] }
            masked[i][mask.column] = this.maskValue(masked[i][mask.column], mask)
          }
        }
      } else {
        if (mask.column in masked) {
          masked[mask.column] = this.maskValue(masked[mask.column], mask)
        }
      }
    }

    return masked
  }

  /**
   * Aplica masking em um valor individual
   */
  private static maskValue(
    value: any,
    mask: { column: string; method: string; regex?: string; replace?: string }
  ): any {
    if (value === null || value === undefined) return value

    const strValue = String(value)

    switch (mask.method) {
      case 'redact':
        return '***REDACTED***'
      
      case 'hash':
        return hashString(strValue)
      
      case 'null':
        return null
      
      case 'regex':
        if (mask.regex && mask.replace !== undefined) {
          try {
            const regex = new RegExp(mask.regex, 'g')
            return strValue.replace(regex, mask.replace)
          } catch (e) {
            console.error('[PEP] Invalid regex:', mask.regex, e)
            return '***ERROR***'
          }
        }
        return strValue
      
      default:
        return value
    }
  }

  /**
   * Aplica enforcement completo (columns + rows + masking)
   */
  static enforce(
    data: any,
    plan: PolicyRewritePlan,
    principal?: string
  ): any {
    if (!data) return data

    let result = data

    // 1. Filter columns
    if (Array.isArray(result)) {
      result = result.map(row => this.filterColumns(row, plan))
    } else {
      result = this.filterColumns(result, plan)
    }

    // 2. Filter rows
    if (Array.isArray(result)) {
      result = this.filterRows(result, plan)
    }

    // 3. Apply masking
    result = this.applyMasking(result, plan, principal)

    return result
  }

  /**
   * Gera SQL WHERE clause para row filtering (para uso em queries)
   */
  static generateSQLWhereClause(plan: PolicyRewritePlan): string {
    const conditions: string[] = []

    // Allow filters (AND)
    for (const filter of plan.allowRowFilters) {
      conditions.push(this.predicateToSQL(filter))
    }

    // Deny filters (NOT)
    for (const filter of plan.denyRowFilters) {
      conditions.push(`NOT (${this.predicateToSQL(filter)})`)
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '1=1'
  }

  /**
   * Converte predicado para SQL
   */
  private static predicateToSQL(predicate: { field: string; op: string; value: any }): string {
    const field = predicate.field
    const value = typeof predicate.value === 'string' 
      ? `'${predicate.value.replace(/'/g, "''")}'` 
      : predicate.value

    switch (predicate.op) {
      case '=':
        return `${field} = ${value}`
      case '!=':
        return `${field} != ${value}`
      case '>':
        return `${field} > ${value}`
      case '>=':
        return `${field} >= ${value}`
      case '<':
        return `${field} < ${value}`
      case '<=':
        return `${field} <= ${value}`
      case 'in':
        const inValues = Array.isArray(predicate.value)
          ? predicate.value.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ')
          : value
        return `${field} IN (${inValues})`
      case 'not_in':
        const notInValues = Array.isArray(predicate.value)
          ? predicate.value.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ')
          : value
        return `${field} NOT IN (${notInValues})`
      default:
        return '1=1'
    }
  }

  /**
   * Gera lista de colunas permitidas para SELECT (para uso em queries)
   */
  static generateSQLSelectColumns(plan: PolicyRewritePlan, allColumns: string[]): string {
    const allowedSet = new Set(plan.allowedColumns)
    const deniedSet = new Set(plan.deniedColumns)

    const selectedColumns = allColumns.filter(col => {
      // Se há allow list, apenas colunas permitidas
      if (plan.allowedColumns.length > 0) {
        if (!allowedSet.has(col)) return false
      }
      
      // Se há deny list, colunas negadas são removidas
      if (deniedSet.has(col)) return false

      return true
    })

    // Aplicar masking nas colunas
    const maskedColumns = selectedColumns.map(col => {
      const mask = plan.masks.find(m => m.column === col)
      if (!mask) return col

      switch (mask.method) {
        case 'redact':
          return `'***REDACTED***' AS ${col}`
        case 'hash':
          return `MD5(${col}::text) AS ${col}`
        case 'null':
          return `NULL AS ${col}`
        case 'regex':
          if (mask.regex && mask.replace !== undefined) {
            return `REGEXP_REPLACE(${col}::text, '${mask.regex}', '${mask.replace}', 'g') AS ${col}`
          }
          return col
        default:
          return col
      }
    })

    return maskedColumns.length > 0 ? maskedColumns.join(', ') : '*'
  }
}
