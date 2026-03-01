/**
 * Circuit Breaker Pattern
 * Prevent cascading failures in distributed systems
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime?: Date;
  lastStateChange?: Date;
  nextAttemptTime?: Date;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000,
  monitoringPeriod: 60000,
};

/**
 * Circuit Breaker class
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: Date;
  private lastStateChange?: Date;
  private nextAttemptTime?: Date;

  constructor(name: string, config?: Partial<Omit<CircuitBreakerConfig, 'name'>>) {
    this.config = {
      name,
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.checkState();

    if (this.state === 'open') {
      throw new Error(`Circuit breaker ${this.config.name} is OPEN`);
    }

    try {
      const result = await this.executeWithTimeout(fn);
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Circuit breaker timeout')), this.config.timeout)
      ),
    ]);
  }

  /**
   * Handle successful execution
   */
  private async onSuccess(): Promise<void> {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        await this.transitionTo('closed');
        this.successes = 0;
      }
    }

    await this.updateRedis();
  }

  /**
   * Handle failed execution
   */
  private async onFailure(error: any): Promise<void> {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      await this.transitionTo('open');
      this.successes = 0;
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      await this.transitionTo('open');
    }

    await this.updateRedis();
    await this.logFailure(error);
  }

  /**
   * Transition to new state
   */
  private async transitionTo(newState: CircuitState): Promise<void> {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === 'open') {
      this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    }

    await this.logStateChange(oldState, newState);
  }

  /**
   * Check and update circuit state
   */
  private async checkState(): Promise<void> {
    if (this.state === 'open' && this.nextAttemptTime && new Date() >= this.nextAttemptTime) {
      await this.transitionTo('half-open');
      this.failures = 0;
      this.successes = 0;
    }

    await this.loadFromRedis();
  }

  /**
   * Get current stats
   */
  async getStats(): Promise<CircuitBreakerStats> {
    await this.loadFromRedis();

    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.failures + this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  async reset(): Promise<void> {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastStateChange = new Date();
    this.nextAttemptTime = undefined;

    await this.updateRedis();
    await this.logReset();
  }

  /**
   * Update Redis state
   */
  private async updateRedis(): Promise<void> {
    const key = `circuit-breaker:${this.config.name}`;
    const data = {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime?.toISOString(),
      lastStateChange: this.lastStateChange?.toISOString(),
      nextAttemptTime: this.nextAttemptTime?.toISOString(),
    };

    await redis.setex(key, this.config.monitoringPeriod / 1000, JSON.stringify(data));
  }

  /**
   * Load state from Redis
   */
  private async loadFromRedis(): Promise<void> {
    const key = `circuit-breaker:${this.config.name}`;
    const data = await redis.get(key);

    if (data) {
      const parsed = JSON.parse(data);
      this.state = parsed.state;
      this.failures = parsed.failures;
      this.successes = parsed.successes;
      this.lastFailureTime = parsed.lastFailureTime ? new Date(parsed.lastFailureTime) : undefined;
      this.lastStateChange = parsed.lastStateChange ? new Date(parsed.lastStateChange) : undefined;
      this.nextAttemptTime = parsed.nextAttemptTime ? new Date(parsed.nextAttemptTime) : undefined;
    }
  }

  /**
   * Log state change
   */
  private async logStateChange(oldState: CircuitState, newState: CircuitState): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: 'CIRCUIT_BREAKER_STATE_CHANGE',
        resourceType: 'circuit_breaker',
        resourceId: this.config.name,
        metadata: JSON.stringify({
          oldState,
          newState,
          failures: this.failures,
          successes: this.successes,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Log failure
   */
  private async logFailure(error: any): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: 'CIRCUIT_BREAKER_FAILURE',
        resourceType: 'circuit_breaker',
        resourceId: this.config.name,
        metadata: JSON.stringify({
          state: this.state,
          failures: this.failures,
          error: error.message,
        }),
        status: 'FAILED',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Log reset
   */
  private async logReset(): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: 'CIRCUIT_BREAKER_RESET',
        resourceType: 'circuit_breaker',
        resourceId: this.config.name,
        metadata: JSON.stringify({ timestamp: new Date() }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });
  }
}

/**
 * Global circuit breaker registry
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }

  return circuitBreakers.get(name)!;
}

/**
 * Execute with circuit breaker
 */
export async function executeWithCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): Promise<T> {
  const breaker = getCircuitBreaker(name, config);
  return breaker.execute(fn);
}

/**
 * Get all circuit breaker stats
 */
export async function getAllCircuitBreakerStats(): Promise<Record<string, CircuitBreakerStats>> {
  const stats: Record<string, CircuitBreakerStats> = {};

  for (const [name, breaker] of circuitBreakers.entries()) {
    stats[name] = await breaker.getStats();
  }

  return stats;
}

/**
 * Reset all circuit breakers
 */
export async function resetAllCircuitBreakers(): Promise<void> {
  for (const breaker of circuitBreakers.values()) {
    await breaker.reset();
  }
}
