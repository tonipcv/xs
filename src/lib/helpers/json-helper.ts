/**
 * JSON HELPER
 * JSON utilities and safe parsing
 */

export class JsonHelper {
  /**
   * Safe parse JSON
   */
  static safeParse<T = any>(json: string, defaultValue?: T): T | null {
    try {
      return JSON.parse(json)
    } catch {
      return defaultValue !== undefined ? defaultValue : null
    }
  }

  /**
   * Safe stringify
   */
  static safeStringify(data: any, pretty: boolean = false): string {
    try {
      return JSON.stringify(data, null, pretty ? 2 : 0)
    } catch {
      return '{}'
    }
  }

  /**
   * Deep clone
   */
  static clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  /**
   * Pretty print
   */
  static pretty(data: any): string {
    return JSON.stringify(data, null, 2)
  }

  /**
   * Minify JSON
   */
  static minify(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json))
    } catch {
      return json
    }
  }

  /**
   * Validate JSON
   */
  static isValid(json: string): boolean {
    try {
      JSON.parse(json)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get JSON size
   */
  static getSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size
  }

  /**
   * Format bytes
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Flatten JSON
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
   * Unflatten JSON
   */
  static unflatten(obj: Record<string, any>): any {
    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
      const keys = key.split('.')
      let current = result

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }

      current[keys[keys.length - 1]] = value
    }

    return result
  }

  /**
   * Compare JSON objects
   */
  static equals(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  /**
   * Get diff between objects
   */
  static diff(a: any, b: any): Record<string, any> {
    const diff: Record<string, any> = {}

    const allKeys = new Set([
      ...Object.keys(a || {}),
      ...Object.keys(b || {}),
    ])

    for (const key of allKeys) {
      if (!this.equals(a[key], b[key])) {
        diff[key] = { old: a[key], new: b[key] }
      }
    }

    return diff
  }

  /**
   * Merge objects
   */
  static merge<T>(...objects: Partial<T>[]): T {
    return Object.assign({}, ...objects) as T
  }

  /**
   * Deep merge
   */
  static deepMerge<T extends object>(...objects: Partial<T>[]): T {
    const result: any = {}

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.deepMerge(result[key] || {}, value)
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * Remove null/undefined values
   */
  static compact(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.filter(v => v !== null && v !== undefined).map(v => this.compact(v))
    }

    if (obj !== null && typeof obj === 'object') {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
          result[key] = this.compact(value)
        }
      }
      return result
    }

    return obj
  }

  /**
   * Extract value by path
   */
  static get(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.')
    let current = obj

    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue
      }
      current = current[key]
    }

    return current !== undefined ? current : defaultValue
  }

  /**
   * Set value by path
   */
  static set(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }

    current[keys[keys.length - 1]] = value
  }
}
