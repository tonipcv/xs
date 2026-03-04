/**
 * DATA TRANSFORMER
 * Transform and map data structures
 */

export type TransformFunction<T, R> = (value: T) => R

export interface TransformRule<T = any, R = any> {
  source: string
  target: string
  transform?: TransformFunction<T, R>
  default?: R
  required?: boolean
}

export class DataTransformer {
  /**
   * Transform object using rules
   */
  static transform<T = any, R = any>(
    data: any,
    rules: TransformRule[]
  ): R {
    const result: any = {}

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.source)

      if (value === undefined || value === null) {
        if (rule.required) {
          throw new Error(`Required field ${rule.source} is missing`)
        }
        if (rule.default !== undefined) {
          this.setNestedValue(result, rule.target, rule.default)
        }
        continue
      }

      const transformed = rule.transform ? rule.transform(value) : value
      this.setNestedValue(result, rule.target, transformed)
    }

    return result as R
  }

  /**
   * Get nested value from object
   */
  private static getNestedValue(obj: any, path: string): any {
    const keys = path.split('.')
    let current = obj

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = current[key]
    }

    return current
  }

  /**
   * Set nested value in object
   */
  private static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current)) {
        current[key] = {}
      }
      current = current[key]
    }

    current[keys[keys.length - 1]] = value
  }

  /**
   * Map array of objects
   */
  static mapArray<T, R>(
    data: T[],
    rules: TransformRule[]
  ): R[] {
    return data.map(item => this.transform<T, R>(item, rules))
  }

  /**
   * Flatten nested object
   */
  static flatten(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flatten(value, newKey))
      } else {
        result[newKey] = value
      }
    }

    return result
  }

  /**
   * Unflatten object
   */
  static unflatten(obj: Record<string, any>): any {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
      this.setNestedValue(result, key, value)
    }

    return result
  }

  /**
   * Pick fields from object
   */
  static pick<T extends object>(obj: T, fields: string[]): Partial<T> {
    const result: any = {}

    for (const field of fields) {
      const value = this.getNestedValue(obj, field)
      if (value !== undefined) {
        this.setNestedValue(result, field, value)
      }
    }

    return result
  }

  /**
   * Omit fields from object
   */
  static omit<T extends object>(obj: T, fields: string[]): Partial<T> {
    const flattened = this.flatten(obj)
    const fieldsSet = new Set(fields)

    const filtered = Object.entries(flattened)
      .filter(([key]) => !fieldsSet.has(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})

    return this.unflatten(filtered)
  }

  /**
   * Rename fields
   */
  static rename(obj: any, mapping: Record<string, string>): any {
    const result: any = {}

    for (const [oldKey, newKey] of Object.entries(mapping)) {
      const value = this.getNestedValue(obj, oldKey)
      if (value !== undefined) {
        this.setNestedValue(result, newKey, value)
      }
    }

    // Copy remaining fields
    const mappedOldKeys = new Set(Object.keys(mapping))
    for (const [key, value] of Object.entries(obj)) {
      if (!mappedOldKeys.has(key)) {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Deep clone object
   */
  static clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  /**
   * Merge objects deeply
   */
  static merge<T extends object>(...objects: Partial<T>[]): T {
    const result: any = {}

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.merge(result[key] || {}, value)
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * Convert to camelCase
   */
  static toCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.toCamelCase(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        result[camelKey] = this.toCamelCase(value)
      }
      return result
    }

    return obj
  }

  /**
   * Convert to snake_case
   */
  static toSnakeCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.toSnakeCase(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
        result[snakeKey] = this.toSnakeCase(value)
      }
      return result
    }

    return obj
  }

  /**
   * Filter object by predicate
   */
  static filter<T extends object>(
    obj: T,
    predicate: (key: string, value: any) => boolean
  ): Partial<T> {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
      if (predicate(key, value)) {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Map object values
   */
  static mapValues<T extends object, R>(
    obj: T,
    mapper: (value: any, key: string) => R
  ): Record<string, R> {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
      result[key] = mapper(value, key)
    }

    return result
  }
}
