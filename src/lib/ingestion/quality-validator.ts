/**
 * Data Quality Validator
 * Validates completeness, consistency, and quality of ingested data
 */

export interface QualityMetrics {
  completeness: number
  consistency: number
  accuracy: number
  validity: number
  uniqueness: number
  overall: number
}

export interface QualityReport {
  valid: boolean
  metrics: QualityMetrics
  errors: QualityError[]
  warnings: QualityWarning[]
  recommendations: string[]
  timestamp: Date
}

export interface QualityError {
  field: string
  type: 'missing' | 'invalid' | 'duplicate' | 'inconsistent'
  message: string
  count: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export interface QualityWarning {
  field: string
  type: string
  message: string
  count: number
}

export interface ValidationRule {
  field: string
  type: 'required' | 'type' | 'range' | 'pattern' | 'unique' | 'custom'
  params?: any
  message?: string
}

export class DataQualityValidator {
  private rules: ValidationRule[] = []
  private thresholds = {
    completeness: 80,
    consistency: 85,
    accuracy: 90,
    validity: 85,
    uniqueness: 95,
  }

  constructor(rules?: ValidationRule[], thresholds?: Partial<typeof DataQualityValidator.prototype.thresholds>) {
    if (rules) this.rules = rules
    if (thresholds) this.thresholds = { ...this.thresholds, ...thresholds }
  }

  async validate(data: any[]): Promise<QualityReport> {
    if (!data || data.length === 0) {
      return {
        valid: false,
        metrics: { completeness: 0, consistency: 0, accuracy: 0, validity: 0, uniqueness: 0, overall: 0 },
        errors: [{ field: 'dataset', type: 'missing', message: 'No data to validate', count: 0, severity: 'critical' }],
        warnings: [],
        recommendations: ['Ensure data source is configured correctly'],
        timestamp: new Date(),
      }
    }

    const errors: QualityError[] = []
    const warnings: QualityWarning[] = []
    const recommendations: string[] = []

    // 1. Completeness check
    const completeness = this.checkCompleteness(data, errors, warnings)

    // 2. Consistency check
    const consistency = this.checkConsistency(data, errors, warnings)

    // 3. Accuracy check
    const accuracy = this.checkAccuracy(data, errors, warnings)

    // 4. Validity check
    const validity = this.checkValidity(data, errors, warnings)

    // 5. Uniqueness check
    const uniqueness = this.checkUniqueness(data, errors, warnings)

    // Calculate overall quality score
    const overall = (completeness + consistency + accuracy + validity + uniqueness) / 5

    // Generate recommendations
    if (completeness < this.thresholds.completeness) {
      recommendations.push(`Improve data completeness (current: ${completeness.toFixed(1)}%, target: ${this.thresholds.completeness}%)`)
    }
    if (consistency < this.thresholds.consistency) {
      recommendations.push(`Fix data type inconsistencies (current: ${consistency.toFixed(1)}%, target: ${this.thresholds.consistency}%)`)
    }
    if (validity < this.thresholds.validity) {
      recommendations.push(`Validate data against schema rules (current: ${validity.toFixed(1)}%, target: ${this.thresholds.validity}%)`)
    }
    if (uniqueness < this.thresholds.uniqueness) {
      recommendations.push(`Remove duplicate records (current: ${uniqueness.toFixed(1)}%, target: ${this.thresholds.uniqueness}%)`)
    }

    return {
      valid: overall >= 70 && errors.filter(e => e.severity === 'critical').length === 0,
      metrics: {
        completeness: Math.round(completeness),
        consistency: Math.round(consistency),
        accuracy: Math.round(accuracy),
        validity: Math.round(validity),
        uniqueness: Math.round(uniqueness),
        overall: Math.round(overall),
      },
      errors,
      warnings,
      recommendations,
      timestamp: new Date(),
    }
  }

  private checkCompleteness(data: any[], errors: QualityError[], warnings: QualityWarning[]): number {
    const keys = Object.keys(data[0])
    let nullCount = 0
    let totalFields = 0
    const fieldNullCounts: Record<string, number> = {}

    data.forEach(row => {
      keys.forEach(key => {
        totalFields++
        if (row[key] === null || row[key] === undefined || row[key] === '') {
          nullCount++
          fieldNullCounts[key] = (fieldNullCounts[key] || 0) + 1
        }
      })
    })

    const completeness = ((totalFields - nullCount) / totalFields) * 100

    // Report fields with high null rates
    Object.entries(fieldNullCounts).forEach(([field, count]) => {
      const nullRate = (count / data.length) * 100
      if (nullRate > 50) {
        errors.push({
          field,
          type: 'missing',
          message: `Field has ${nullRate.toFixed(1)}% null values`,
          count,
          severity: nullRate > 80 ? 'critical' : 'high',
        })
      } else if (nullRate > 20) {
        warnings.push({
          field,
          type: 'completeness',
          message: `Field has ${nullRate.toFixed(1)}% null values`,
          count,
        })
      }
    })

    return completeness
  }

  private checkConsistency(data: any[], errors: QualityError[], warnings: QualityWarning[]): number {
    const keys = Object.keys(data[0])
    const typeMap: Record<string, Set<string>> = {}

    data.forEach(row => {
      keys.forEach(key => {
        if (!typeMap[key]) typeMap[key] = new Set()
        const value = row[key]
        if (value !== null && value !== undefined) {
          typeMap[key].add(typeof value)
        }
      })
    })

    let inconsistentFields = 0
    Object.entries(typeMap).forEach(([key, types]) => {
      if (types.size > 2) {
        inconsistentFields++
        errors.push({
          field: key,
          type: 'inconsistent',
          message: `Field has ${types.size} different data types: ${Array.from(types).join(', ')}`,
          count: types.size,
          severity: 'high',
        })
      } else if (types.size === 2) {
        warnings.push({
          field: key,
          type: 'consistency',
          message: `Field has mixed types: ${Array.from(types).join(', ')}`,
          count: 2,
        })
      }
    })

    return ((keys.length - inconsistentFields) / keys.length) * 100
  }

  private checkAccuracy(data: any[], errors: QualityError[], warnings: QualityWarning[]): number {
    // Check for obvious data quality issues
    let accuracyScore = 100
    const keys = Object.keys(data[0])

    keys.forEach(key => {
      const values = data.map(row => row[key]).filter(v => v !== null && v !== undefined)
      
      // Check for placeholder values
      const placeholders = ['N/A', 'null', 'undefined', 'TBD', 'TODO', '???']
      const placeholderCount = values.filter(v => 
        typeof v === 'string' && placeholders.includes(v.toUpperCase())
      ).length

      if (placeholderCount > 0) {
        const rate = (placeholderCount / data.length) * 100
        if (rate > 10) {
          errors.push({
            field: key,
            type: 'invalid',
            message: `Field contains ${placeholderCount} placeholder values`,
            count: placeholderCount,
            severity: rate > 30 ? 'high' : 'medium',
          })
          accuracyScore -= rate / keys.length
        }
      }

      // Check for outliers in numeric fields
      const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v))
      if (numericValues.length > 10) {
        const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        const stdDev = Math.sqrt(
          numericValues.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / numericValues.length
        )
        const outliers = numericValues.filter(v => Math.abs(v - mean) > 3 * stdDev)
        
        if (outliers.length > numericValues.length * 0.05) {
          warnings.push({
            field: key,
            type: 'accuracy',
            message: `Field has ${outliers.length} potential outliers`,
            count: outliers.length,
          })
        }
      }
    })

    return Math.max(0, accuracyScore)
  }

  private checkValidity(data: any[], errors: QualityError[], warnings: QualityWarning[]): number {
    if (this.rules.length === 0) return 100

    let validCount = 0
    let totalChecks = 0

    this.rules.forEach(rule => {
      data.forEach(row => {
        totalChecks++
        const value = row[rule.field]

        let isValid = true

        switch (rule.type) {
          case 'required':
            isValid = value !== null && value !== undefined && value !== ''
            break
          case 'type':
            isValid = typeof value === rule.params?.type
            break
          case 'range':
            if (typeof value === 'number') {
              isValid = value >= rule.params?.min && value <= rule.params?.max
            }
            break
          case 'pattern':
            if (typeof value === 'string' && rule.params?.pattern) {
              isValid = new RegExp(rule.params.pattern).test(value)
            }
            break
        }

        if (isValid) validCount++
      })
    })

    const validity = (validCount / totalChecks) * 100

    if (validity < this.thresholds.validity) {
      errors.push({
        field: 'validation',
        type: 'invalid',
        message: `${totalChecks - validCount} validation rule failures`,
        count: totalChecks - validCount,
        severity: validity < 50 ? 'critical' : 'high',
      })
    }

    return validity
  }

  private checkUniqueness(data: any[], errors: QualityError[], warnings: QualityWarning[]): number {
    const keys = Object.keys(data[0])
    let totalUniqueness = 0

    keys.forEach(key => {
      const values = data.map(row => JSON.stringify(row[key]))
      const uniqueValues = new Set(values)
      const uniqueness = (uniqueValues.size / values.length) * 100
      totalUniqueness += uniqueness

      if (uniqueness < 50) {
        warnings.push({
          field: key,
          type: 'uniqueness',
          message: `Field has only ${uniqueness.toFixed(1)}% unique values`,
          count: values.length - uniqueValues.size,
        })
      }
    })

    // Check for duplicate rows
    const rowHashes = data.map(row => JSON.stringify(row))
    const uniqueRows = new Set(rowHashes)
    const duplicateCount = rowHashes.length - uniqueRows.size

    if (duplicateCount > 0) {
      errors.push({
        field: 'row',
        type: 'duplicate',
        message: `Dataset contains ${duplicateCount} duplicate rows`,
        count: duplicateCount,
        severity: duplicateCount > data.length * 0.1 ? 'high' : 'medium',
      })
    }

    return (totalUniqueness / keys.length)
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule)
  }

  setThresholds(thresholds: Partial<typeof DataQualityValidator.prototype.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds }
  }
}
