/**
 * CIRCUIT BREAKER PATTERN
 * Prevent cascading failures
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold: number
  successThreshold: number
  timeout: number
  resetTimeout: number
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailureTime?: Date
  nextAttemptTime?: Date
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private successes = 0
  private lastFailureTime?: Date
  private nextAttemptTime?: Date

  constructor(private options: CircuitBreakerOptions) {}

  /**
   * Execute function with circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN'
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await this.executeWithTimeout(fn)
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), this.options.timeout)
      ),
    ])
  }

  /**
   * Handle success
   */
  private onSuccess(): void {
    this.failures = 0

    if (this.state === 'HALF_OPEN') {
      this.successes++

      if (this.successes >= this.options.successThreshold) {
        this.state = 'CLOSED'
        this.successes = 0
      }
    }
  }

  /**
   * Handle failure
   */
  private onFailure(): void {
    this.failures++
    this.lastFailureTime = new Date()

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN'
      this.successes = 0
      this.nextAttemptTime = new Date(Date.now() + this.options.resetTimeout)
    }

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttemptTime = new Date(Date.now() + this.options.resetTimeout)
    }
  }

  /**
   * Should attempt reset
   */
  private shouldAttemptReset(): boolean {
    return (
      this.nextAttemptTime !== undefined &&
      Date.now() >= this.nextAttemptTime.getTime()
    )
  }

  /**
   * Get state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    }
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
    this.lastFailureTime = undefined
    this.nextAttemptTime = undefined
  }

  /**
   * Force open
   */
  forceOpen(): void {
    this.state = 'OPEN'
    this.nextAttemptTime = new Date(Date.now() + this.options.resetTimeout)
  }

  /**
   * Force close
   */
  forceClose(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
  }
}

/**
 * Circuit Breaker Manager
 */
export class CircuitBreakerManager {
  private static breakers: Map<string, CircuitBreaker> = new Map()

  /**
   * Get or create circuit breaker
   */
  static get(
    name: string,
    options?: Partial<CircuitBreakerOptions>
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 3000,
        resetTimeout: 60000,
      }

      this.breakers.set(
        name,
        new CircuitBreaker({ ...defaultOptions, ...options })
      )
    }

    return this.breakers.get(name)!
  }

  /**
   * List all breakers
   */
  static list(): Array<{ name: string; stats: CircuitBreakerStats }> {
    return Array.from(this.breakers.entries()).map(([name, breaker]) => ({
      name,
      stats: breaker.getStats(),
    }))
  }

  /**
   * Reset all breakers
   */
  static resetAll(): void {
    // Clear registry to ensure fresh state across tests/usages
    this.breakers.clear()
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    total: number
    byState: Record<CircuitState, number>
  } {
    const byState: Record<CircuitState, number> = {
      CLOSED: 0,
      OPEN: 0,
      HALF_OPEN: 0,
    }

    for (const breaker of this.breakers.values()) {
      byState[breaker.getState()]++
    }

    return {
      total: this.breakers.size,
      byState,
    }
  }
}
