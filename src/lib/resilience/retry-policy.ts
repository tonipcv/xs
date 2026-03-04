/**
 * RETRY POLICY
 * Configurable retry strategies with exponential backoff
 */

export interface RetryOptions {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors?: string[]
  onRetry?: (attempt: number, error: Error) => void
}

export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalDuration: number
}

export class RetryPolicy {
  private static readonly DEFAULT_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  }

  /**
   * Execute function with retry logic
   */
  static async execute<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    let lastError: Error | null = null
    const startTime = Date.now()

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const result = await fn()
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if error is retryable
        if (opts.retryableErrors && opts.retryableErrors.length > 0) {
          const isRetryable = opts.retryableErrors.some(pattern =>
            lastError!.message.includes(pattern)
          )
          if (!isRetryable) {
            throw lastError
          }
        }

        // Don't retry on last attempt
        if (attempt === opts.maxAttempts) {
          throw lastError
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelayMs
        )

        // Call retry callback
        if (opts.onRetry) {
          opts.onRetry(attempt, lastError)
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Retry failed')
  }

  /**
   * Execute with detailed result
   */
  static async executeWithResult<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const startTime = Date.now()
    let attempts = 0

    try {
      const result = await this.execute(fn, {
        ...options,
        onRetry: (attempt, error) => {
          attempts = attempt
          if (options.onRetry) {
            options.onRetry(attempt, error)
          }
        },
      })

      return {
        success: true,
        result,
        attempts: attempts + 1,
        totalDuration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: attempts + 1,
        totalDuration: Date.now() - startTime,
      }
    }
  }

  /**
   * Retry with jitter
   */
  static async executeWithJitter<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    return this.execute(fn, {
      ...options,
      onRetry: (attempt, error) => {
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000
        if (options.onRetry) {
          options.onRetry(attempt, error)
        }
      },
    })
  }

  /**
   * Retry specific errors only
   */
  static async retryOnErrors<T>(
    fn: () => Promise<T>,
    errorPatterns: string[],
    maxAttempts: number = 3
  ): Promise<T> {
    return this.execute(fn, {
      maxAttempts,
      retryableErrors: errorPatterns,
    })
  }

  /**
   * Retry with custom backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    delays: number[]
  ): Promise<T> {
    let lastError: Error | null = null

    for (let i = 0; i < delays.length + 1; i++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (i < delays.length) {
          await new Promise(resolve => setTimeout(resolve, delays[i]))
        }
      }
    }

    throw lastError || new Error('Retry failed')
  }

  /**
   * Retry until condition is met
   */
  static async retryUntil<T>(
    fn: () => Promise<T>,
    condition: (result: T) => boolean,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    let lastResult: T | null = null

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const result = await fn()
        
        if (condition(result)) {
          return result
        }

        lastResult = result

        if (attempt < opts.maxAttempts) {
          const delay = Math.min(
            opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
            opts.maxDelayMs
          )
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      } catch (error) {
        if (attempt === opts.maxAttempts) {
          throw error
        }

        const delay = Math.min(
          opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelayMs
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error(`Condition not met after ${opts.maxAttempts} attempts`)
  }

  /**
   * Batch retry
   */
  static async retryBatch<T>(
    items: T[],
    fn: (item: T) => Promise<any>,
    options: Partial<RetryOptions> = {}
  ): Promise<{
    successful: T[]
    failed: Array<{ item: T; error: Error }>
  }> {
    const successful: T[] = []
    const failed: Array<{ item: T; error: Error }> = []

    for (const item of items) {
      try {
        await this.execute(() => fn(item), options)
        successful.push(item)
      } catch (error) {
        failed.push({
          item,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }

    return { successful, failed }
  }

  /**
   * Create retry decorator
   */
  static createRetryDecorator(options: Partial<RetryOptions> = {}) {
    return function <T extends (...args: any[]) => Promise<any>>(
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value

      descriptor.value = async function (...args: any[]) {
        return RetryPolicy.execute(
          () => originalMethod.apply(this, args),
          options
        )
      }

      return descriptor
    }
  }

  /**
   * Exponential backoff calculator
   */
  static calculateBackoff(
    attempt: number,
    initialDelay: number,
    multiplier: number,
    maxDelay: number,
    jitter: boolean = false
  ): number {
    let delay = initialDelay * Math.pow(multiplier, attempt - 1)
    delay = Math.min(delay, maxDelay)

    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5)
    }

    return Math.floor(delay)
  }
}
