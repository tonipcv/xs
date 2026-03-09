/**
 * Circuit Breaker Pattern
 * Prevents cascading failures in distributed systems
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  consecutiveSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: Date;
  private consecutiveSuccesses = 0;
  private halfOpenCalls = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const resetTimeout = this.config.resetTimeout || 30000;
    const halfOpenMaxCalls = this.config.halfOpenMaxCalls || 3;

    if (this.state === 'OPEN') {
      if (Date.now() - (this.lastFailureTime?.getTime() || 0) > resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= halfOpenMaxCalls) {
      throw new Error('Circuit breaker is HALF_OPEN and max calls reached');
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
    }

    try {
      const timeout = this.config.timeout || 30000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout);
      });
      const result = await Promise.race([fn(), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    const halfOpenMaxCalls = this.config.halfOpenMaxCalls || 3;
    this.consecutiveSuccesses++;
    this.successes++;

    if (this.state === 'HALF_OPEN' && this.consecutiveSuccesses >= halfOpenMaxCalls) {
      this.state = 'CLOSED';
      this.reset();
    }
  }

  private onFailure(): void {
    this.failures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = new Date();

    if (this.state === 'HALF_OPEN' || this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCalls = 0;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  getState(): CircuitState {
    return this.state;
  }
}

export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}

export class CircuitBreakerManager {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  static get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(config || {
        failureThreshold: 3,
        resetTimeout: 5000,
      }));
    }
    return this.breakers.get(name)!;
  }

  static resetAll(): void {
    this.breakers.clear();
  }

  static list(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  static getStatistics(): { total: number; byState: Record<string, number> } {
    const stats = {
      total: this.breakers.size,
      byState: {} as Record<string, number>,
    };

    for (const breaker of this.breakers.values()) {
      const state = breaker.getState();
      stats.byState[state] = (stats.byState[state] || 0) + 1;
    }

    return stats;
  }
}
