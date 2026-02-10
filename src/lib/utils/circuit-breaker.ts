/**
 * CIRCUIT BREAKER PATTERN
 * 
 * Prevents cascading failures when external services are down
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
 */

import { getRedisClient } from '@/lib/redis'

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening
  successThreshold: number // Number of successes to close from half-open
  timeout: number // Milliseconds to wait before half-open
  monitoringPeriod: number // Milliseconds to track failures
}

export class CircuitBreaker {
  private serviceName: string
  private config: CircuitBreakerConfig

  constructor(
    serviceName: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.serviceName = serviceName
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000, // 1 minute
      monitoringPeriod: config.monitoringPeriod || 120000, // 2 minutes
    }
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState()

    // If circuit is OPEN, fail fast
    if (state === CircuitState.OPEN) {
      const canRetry = await this.canRetry()
      if (!canRetry) {
        throw new Error(`Circuit breaker OPEN for ${this.serviceName}`)
      }
      // Move to HALF_OPEN to test
      await this.setState(CircuitState.HALF_OPEN)
    }

    try {
      const result = await fn()
      await this.onSuccess()
      return result
    } catch (error) {
      await this.onFailure()
      throw error
    }
  }

  /**
   * Get current circuit state
   */
  private async getState(): Promise<CircuitState> {
    const redis = await getRedisClient()
    const key = `circuit:${this.serviceName}:state`
    const state = await redis.get(key)
    return (state as CircuitState) || CircuitState.CLOSED
  }

  /**
   * Set circuit state
   */
  private async setState(state: CircuitState): Promise<void> {
    const redis = await getRedisClient()
    const key = `circuit:${this.serviceName}:state`
    await redis.set(key, state, { EX: 3600 }) // 1 hour expiry
  }

  /**
   * Check if circuit can retry (transition to HALF_OPEN)
   */
  private async canRetry(): Promise<boolean> {
    const redis = await getRedisClient()
    const key = `circuit:${this.serviceName}:opened_at`
    const openedAt = await redis.get(key)

    if (!openedAt) return true

    const elapsed = Date.now() - parseInt(openedAt, 10)
    return elapsed >= this.config.timeout
  }

  /**
   * Handle successful execution
   */
  private async onSuccess(): Promise<void> {
    const state = await this.getState()
    const redis = await getRedisClient()

    if (state === CircuitState.HALF_OPEN) {
      // Increment success counter
      const successKey = `circuit:${this.serviceName}:successes`
      const successes = await redis.incr(successKey)
      await redis.expire(successKey, 60)

      // If enough successes, close circuit
      if (successes >= this.config.successThreshold) {
        await this.setState(CircuitState.CLOSED)
        await redis.del(successKey)
        await redis.del(`circuit:${this.serviceName}:failures`)
        await redis.del(`circuit:${this.serviceName}:opened_at`)
        console.log(`[CircuitBreaker] ${this.serviceName} circuit CLOSED`)
      }
    } else if (state === CircuitState.CLOSED) {
      // Reset failure counter on success
      await redis.del(`circuit:${this.serviceName}:failures`)
    }
  }

  /**
   * Handle failed execution
   */
  private async onFailure(): Promise<void> {
    const state = await this.getState()
    const redis = await getRedisClient()

    if (state === CircuitState.HALF_OPEN) {
      // Failure in HALF_OPEN → back to OPEN
      await this.setState(CircuitState.OPEN)
      await redis.set(`circuit:${this.serviceName}:opened_at`, Date.now().toString())
      console.log(`[CircuitBreaker] ${this.serviceName} circuit back to OPEN`)
      return
    }

    // Increment failure counter
    const failureKey = `circuit:${this.serviceName}:failures`
    const failures = await redis.incr(failureKey)
    await redis.expire(failureKey, this.config.monitoringPeriod / 1000)

    // If threshold exceeded, open circuit
    if (failures >= this.config.failureThreshold) {
      await this.setState(CircuitState.OPEN)
      await redis.set(`circuit:${this.serviceName}:opened_at`, Date.now().toString())
      console.log(`[CircuitBreaker] ${this.serviceName} circuit OPENED after ${failures} failures`)
    }
  }

  /**
   * Get circuit breaker stats
   */
  async getStats(): Promise<{
    state: CircuitState
    failures: number
    successes: number
    openedAt?: number
  }> {
    const redis = await getRedisClient()
    const state = await this.getState()
    
    const failures = parseInt(await redis.get(`circuit:${this.serviceName}:failures`) || '0', 10)
    const successes = parseInt(await redis.get(`circuit:${this.serviceName}:successes`) || '0', 10)
    const openedAt = await redis.get(`circuit:${this.serviceName}:opened_at`)

    return {
      state,
      failures,
      successes,
      openedAt: openedAt ? parseInt(openedAt, 10) : undefined,
    }
  }

  /**
   * Manually reset circuit breaker
   */
  async reset(): Promise<void> {
    const redis = await getRedisClient()
    await this.setState(CircuitState.CLOSED)
    await redis.del(`circuit:${this.serviceName}:failures`)
    await redis.del(`circuit:${this.serviceName}:successes`)
    await redis.del(`circuit:${this.serviceName}:opened_at`)
    console.log(`[CircuitBreaker] ${this.serviceName} circuit manually RESET`)
  }
}

/**
 * Helper to create circuit breaker for external API calls
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  serviceName: string,
  fn: T,
  config?: Partial<CircuitBreakerConfig>
): T {
  const breaker = new CircuitBreaker(serviceName, config)
  
  return (async (...args: any[]) => {
    return breaker.execute(() => fn(...args))
  }) as T
}
