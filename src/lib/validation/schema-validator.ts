/**
 * SCHEMA VALIDATOR
 * Advanced schema validation with custom rules
 */

export interface ValidationRule {
  field: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'uuid' | 'date'
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  custom?: (value: any) => boolean | string
  enum?: any[]
  default?: any
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  data?: any
}

export interface ValidationError {
  field: string
  message: string
  value?: any
}

export class SchemaValidator {
  private rules: ValidationRule[] = []

  /**
   * Add validation rule
   */
  rule(rule: ValidationRule): this {
    this.rules.push(rule)
    return this
  }

  /**
   * Validate data
   */
  validate(data: any): ValidationResult {
    const errors: ValidationError[] = []
    const validated: any = {}

    for (const rule of this.rules) {
      const value = data[rule.field]

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: rule.field,
          message: `${rule.field} is required`,
        })
        continue
      }

      // Skip if not required and no value
      if (!rule.required && (value === undefined || value === null)) {
        if (rule.default !== undefined) {
          validated[rule.field] = rule.default
        }
        continue
      }

      // Type validation
      const typeError = this.validateType(rule.field, value, rule.type)
      if (typeError) {
        errors.push(typeError)
        continue
      }

      // Min/Max validation
      if (rule.min !== undefined) {
        const minError = this.validateMin(rule.field, value, rule.min, rule.type)
        if (minError) errors.push(minError)
      }

      if (rule.max !== undefined) {
        const maxError = this.validateMax(rule.field, value, rule.max, rule.type)
        if (maxError) errors.push(maxError)
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          errors.push({
            field: rule.field,
            message: `${rule.field} does not match pattern`,
            value,
          })
        }
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be one of: ${rule.enum.join(', ')}`,
          value,
        })
      }

      // Custom validation
      if (rule.custom) {
        const result = rule.custom(value)
        if (result !== true) {
          errors.push({
            field: rule.field,
            message: typeof result === 'string' ? result : `${rule.field} is invalid`,
            value,
          })
        }
      }

      validated[rule.field] = value
    }

    return {
      valid: errors.length === 0,
      errors,
      data: errors.length === 0 ? validated : undefined,
    }
  }

  /**
   * Validate type
   */
  private validateType(field: string, value: any, type: string): ValidationError | null {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return { field, message: `${field} must be a string`, value }
        }
        break

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { field, message: `${field} must be a number`, value }
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          return { field, message: `${field} must be a boolean`, value }
        }
        break

      case 'array':
        if (!Array.isArray(value)) {
          return { field, message: `${field} must be an array`, value }
        }
        break

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { field, message: `${field} must be an object`, value }
        }
        break

      case 'email':
        if (typeof value !== 'string' || !this.isEmail(value)) {
          return { field, message: `${field} must be a valid email`, value }
        }
        break

      case 'url':
        if (typeof value !== 'string' || !this.isUrl(value)) {
          return { field, message: `${field} must be a valid URL`, value }
        }
        break

      case 'uuid':
        if (typeof value !== 'string' || !this.isUuid(value)) {
          return { field, message: `${field} must be a valid UUID`, value }
        }
        break

      case 'date':
        if (!(value instanceof Date) && !this.isDateString(value)) {
          return { field, message: `${field} must be a valid date`, value }
        }
        break
    }

    return null
  }

  /**
   * Validate min
   */
  private validateMin(field: string, value: any, min: number, type: string): ValidationError | null {
    if (type === 'number' && value < min) {
      return { field, message: `${field} must be at least ${min}`, value }
    }

    if (type === 'string' && value.length < min) {
      return { field, message: `${field} must be at least ${min} characters`, value }
    }

    if (type === 'array' && value.length < min) {
      return { field, message: `${field} must have at least ${min} items`, value }
    }

    return null
  }

  /**
   * Validate max
   */
  private validateMax(field: string, value: any, max: number, type: string): ValidationError | null {
    if (type === 'number' && value > max) {
      return { field, message: `${field} must be at most ${max}`, value }
    }

    if (type === 'string' && value.length > max) {
      return { field, message: `${field} must be at most ${max} characters`, value }
    }

    if (type === 'array' && value.length > max) {
      return { field, message: `${field} must have at most ${max} items`, value }
    }

    return null
  }

  /**
   * Check if email
   */
  private isEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  /**
   * Check if URL
   */
  private isUrl(value: string): boolean {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if UUID
   */
  private isUuid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
  }

  /**
   * Check if date string
   */
  private isDateString(value: any): boolean {
    if (typeof value !== 'string') return false
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  /**
   * Create validator from schema
   */
  static fromSchema(schema: Record<string, Partial<ValidationRule>>): SchemaValidator {
    const validator = new SchemaValidator()

    for (const [field, rule] of Object.entries(schema)) {
      validator.rule({
        field,
        type: rule.type || 'string',
        ...rule,
      })
    }

    return validator
  }

  /**
   * Quick validate
   */
  static validate(data: any, rules: ValidationRule[]): ValidationResult {
    const validator = new SchemaValidator()
    rules.forEach(rule => validator.rule(rule))
    return validator.validate(data)
  }
}
