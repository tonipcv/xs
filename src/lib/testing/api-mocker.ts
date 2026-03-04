/**
 * API MOCKER
 * Mock API responses for testing
 */

export interface MockResponse {
  status: number
  headers?: Record<string, string>
  body?: any
  delay?: number
}

export interface MockRule {
  method: string
  path: string | RegExp
  response: MockResponse | ((request: any) => MockResponse)
  times?: number
  called?: number
}

export class ApiMocker {
  private static rules: MockRule[] = []
  private static enabled = false

  /**
   * Enable mocking
   */
  static enable(): void {
    this.enabled = true
  }

  /**
   * Disable mocking
   */
  static disable(): void {
    this.enabled = false
  }

  /**
   * Check if mocking is enabled
   */
  static isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Add mock rule
   */
  static mock(rule: Omit<MockRule, 'called'>): void {
    this.rules.push({ ...rule, called: 0 })
  }

  /**
   * Mock GET request
   */
  static get(path: string | RegExp, response: MockResponse | ((request: any) => MockResponse)): void {
    this.mock({ method: 'GET', path, response })
  }

  /**
   * Mock POST request
   */
  static post(path: string | RegExp, response: MockResponse | ((request: any) => MockResponse)): void {
    this.mock({ method: 'POST', path, response })
  }

  /**
   * Mock PUT request
   */
  static put(path: string | RegExp, response: MockResponse | ((request: any) => MockResponse)): void {
    this.mock({ method: 'PUT', path, response })
  }

  /**
   * Mock DELETE request
   */
  static delete(path: string | RegExp, response: MockResponse | ((request: any) => MockResponse)): void {
    this.mock({ method: 'DELETE', path, response })
  }

  /**
   * Find matching rule
   */
  static findRule(method: string, path: string): MockRule | null {
    for (const rule of this.rules) {
      // Check method
      if (rule.method !== method) continue

      // Check path
      const pathMatches = typeof rule.path === 'string'
        ? rule.path === path
        : rule.path.test(path)

      if (!pathMatches) continue

      // Check times limit
      if (rule.times !== undefined && (rule.called || 0) >= rule.times) {
        continue
      }

      return rule
    }

    return null
  }

  /**
   * Execute mock
   */
  static async executeMock(method: string, path: string, request?: any): Promise<MockResponse | null> {
    if (!this.enabled) return null

    const rule = this.findRule(method, path)
    if (!rule) return null

    // Increment call counter
    rule.called = (rule.called || 0) + 1

    // Get response
    const response = typeof rule.response === 'function'
      ? rule.response(request)
      : rule.response

    // Apply delay if specified
    if (response.delay) {
      await new Promise(resolve => setTimeout(resolve, response.delay))
    }

    return response
  }

  /**
   * Clear all rules
   */
  static clear(): void {
    this.rules = []
  }

  /**
   * Reset call counters
   */
  static reset(): void {
    for (const rule of this.rules) {
      rule.called = 0
    }
  }

  /**
   * Get call count for rule
   */
  static getCallCount(method: string, path: string): number {
    const rule = this.rules.find(r => {
      const methodMatches = r.method === method
      const pathMatches = typeof r.path === 'string'
        ? r.path === path
        : r.path.test(path)
      return methodMatches && pathMatches
    })

    return rule?.called || 0
  }

  /**
   * Verify rule was called
   */
  static verify(method: string, path: string, times?: number): boolean {
    const count = this.getCallCount(method, path)
    
    if (times === undefined) {
      return count > 0
    }

    return count === times
  }

  /**
   * Create mock server
   */
  static createServer(): {
    start: () => void
    stop: () => void
    reset: () => void
  } {
    return {
      start: () => this.enable(),
      stop: () => this.disable(),
      reset: () => {
        this.clear()
        this.disable()
      },
    }
  }

  /**
   * Mock sequence of responses
   */
  static sequence(method: string, path: string, responses: MockResponse[]): void {
    let index = 0

    this.mock({
      method,
      path,
      response: () => {
        const response = responses[index]
        index = Math.min(index + 1, responses.length - 1)
        return response
      },
    })
  }

  /**
   * Mock error response
   */
  static error(method: string, path: string, status: number = 500, message: string = 'Internal Server Error'): void {
    this.mock({
      method,
      path,
      response: {
        status,
        body: { error: message },
      },
    })
  }

  /**
   * Mock success response
   */
  static success(method: string, path: string, data: any): void {
    this.mock({
      method,
      path,
      response: {
        status: 200,
        body: data,
      },
    })
  }

  /**
   * Mock with delay
   */
  static delayed(method: string, path: string, response: MockResponse, delay: number): void {
    this.mock({
      method,
      path,
      response: { ...response, delay },
    })
  }

  /**
   * Get all rules
   */
  static getRules(): MockRule[] {
    return [...this.rules]
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalRules: number
    totalCalls: number
    byMethod: Record<string, number>
  } {
    const byMethod: Record<string, number> = {}
    let totalCalls = 0

    for (const rule of this.rules) {
      byMethod[rule.method] = (byMethod[rule.method] || 0) + 1
      totalCalls += rule.called || 0
    }

    return {
      totalRules: this.rules.length,
      totalCalls,
      byMethod,
    }
  }
}
