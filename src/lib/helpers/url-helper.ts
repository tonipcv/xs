/**
 * URL HELPER
 * URL manipulation utilities
 */

export class UrlHelper {
  /**
   * Parse URL
   */
  static parse(url: string): {
    protocol: string
    host: string
    hostname: string
    port: string
    pathname: string
    search: string
    hash: string
    params: Record<string, string>
  } | null {
    try {
      const parsed = new URL(url)
      const params: Record<string, string> = {}

      parsed.searchParams.forEach((value, key) => {
        params[key] = value
      })

      return {
        protocol: parsed.protocol,
        host: parsed.host,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        params,
      }
    } catch {
      return null
    }
  }

  /**
   * Build URL
   */
  static build(
    base: string,
    params?: Record<string, any>,
    hash?: string
  ): string {
    try {
      const url = new URL(base)

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value))
          }
        })
      }

      if (hash) {
        url.hash = hash
      }

      return url.toString()
    } catch {
      return base
    }
  }

  /**
   * Add query params
   */
  static addParams(url: string, params: Record<string, any>): string {
    return this.build(url, params)
  }

  /**
   * Remove query params
   */
  static removeParams(url: string, keys: string[]): string {
    try {
      const parsed = new URL(url)
      keys.forEach(key => parsed.searchParams.delete(key))
      return parsed.toString()
    } catch {
      return url
    }
  }

  /**
   * Get query param
   */
  static getParam(url: string, key: string): string | null {
    try {
      const parsed = new URL(url)
      return parsed.searchParams.get(key)
    } catch {
      return null
    }
  }

  /**
   * Get all query params
   */
  static getParams(url: string): Record<string, string> {
    const parsed = this.parse(url)
    return parsed?.params || {}
  }

  /**
   * Is valid URL
   */
  static isValid(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  /**
   * Is absolute URL
   */
  static isAbsolute(url: string): boolean {
    return /^https?:\/\//i.test(url)
  }

  /**
   * Join paths
   */
  static join(...parts: string[]): string {
    return parts
      .map((part, i) => {
        if (i === 0) {
          return part.replace(/\/$/, '')
        }
        return part.replace(/^\//, '').replace(/\/$/, '')
      })
      .filter(Boolean)
      .join('/')
  }

  /**
   * Get domain
   */
  static getDomain(url: string): string | null {
    const parsed = this.parse(url)
    return parsed?.hostname || null
  }

  /**
   * Get base URL
   */
  static getBase(url: string): string | null {
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return null
    }
  }

  /**
   * Encode URI component
   */
  static encode(str: string): string {
    return encodeURIComponent(str)
  }

  /**
   * Decode URI component
   */
  static decode(str: string): string {
    try {
      return decodeURIComponent(str)
    } catch {
      return str
    }
  }

  /**
   * Parse query string
   */
  static parseQuery(query: string): Record<string, string> {
    const params: Record<string, string> = {}
    const searchParams = new URLSearchParams(query)

    searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  }

  /**
   * Build query string
   */
  static buildQuery(params: Record<string, any>): string {
    const searchParams = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.set(key, String(value))
      }
    })

    return searchParams.toString()
  }

  /**
   * Normalize URL
   */
  static normalize(url: string): string {
    try {
      const parsed = new URL(url)
      
      // Remove trailing slash
      if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.slice(0, -1)
      }

      // Sort query params
      const params = Array.from(parsed.searchParams.entries()).sort()
      parsed.search = ''
      params.forEach(([key, value]) => {
        parsed.searchParams.append(key, value)
      })

      return parsed.toString()
    } catch {
      return url
    }
  }

  /**
   * Is same origin
   */
  static isSameOrigin(url1: string, url2: string): boolean {
    try {
      const parsed1 = new URL(url1)
      const parsed2 = new URL(url2)
      return parsed1.origin === parsed2.origin
    } catch {
      return false
    }
  }

  /**
   * Get file extension
   */
  static getExtension(url: string): string | null {
    try {
      const parsed = new URL(url)
      const pathname = parsed.pathname
      const match = pathname.match(/\.([^.]+)$/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  /**
   * Get filename
   */
  static getFilename(url: string): string | null {
    try {
      const parsed = new URL(url)
      const parts = parsed.pathname.split('/')
      return parts[parts.length - 1] || null
    } catch {
      return null
    }
  }
}
