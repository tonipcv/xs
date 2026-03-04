/**
 * MIDDLEWARE CHAIN
 * Composable middleware system for API routes
 */

import { NextRequest, NextResponse } from 'next/server'

export type MiddlewareFunction = (
  request: NextRequest,
  context: MiddlewareContext
) => Promise<NextResponse | void>

export interface MiddlewareContext {
  [key: string]: any
}

export class MiddlewareChain {
  private middlewares: MiddlewareFunction[] = []

  /**
   * Add middleware to chain
   */
  use(middleware: MiddlewareFunction): this {
    this.middlewares.push(middleware)
    return this
  }

  /**
   * Execute middleware chain
   */
  async execute(request: NextRequest): Promise<NextResponse> {
    const context: MiddlewareContext = {}

    for (const middleware of this.middlewares) {
      const result = await middleware(request, context)
      
      // If middleware returns a response, stop chain
      if (result instanceof NextResponse) {
        return result
      }
    }

    // If no middleware returned a response, return 200
    return NextResponse.json({ success: true })
  }

  /**
   * Create middleware chain
   */
  static create(): MiddlewareChain {
    return new MiddlewareChain()
  }

  /**
   * Compose multiple middleware functions
   */
  static compose(...middlewares: MiddlewareFunction[]): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      for (const middleware of middlewares) {
        const result = await middleware(request, context)
        if (result instanceof NextResponse) {
          return result
        }
      }
    }
  }

  /**
   * Create conditional middleware
   */
  static when(
    condition: (request: NextRequest) => boolean,
    middleware: MiddlewareFunction
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      if (condition(request)) {
        return middleware(request, context)
      }
    }
  }

  /**
   * Create error handling middleware
   */
  static errorHandler(
    handler: (error: Error, request: NextRequest) => NextResponse
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      try {
        // Execute next middleware
        return undefined
      } catch (error) {
        return handler(error as Error, request)
      }
    }
  }

  /**
   * Create logging middleware
   */
  static logger(
    logger: (request: NextRequest, duration: number) => void
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const start = Date.now()
      context.startTime = start

      // Store cleanup function
      context.cleanup = () => {
        const duration = Date.now() - start
        logger(request, duration)
      }
    }
  }

  /**
   * Create rate limiting middleware
   */
  static rateLimit(
    limiter: (request: NextRequest) => Promise<boolean>
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const allowed = await limiter(request)
      
      if (!allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        )
      }
    }
  }

  /**
   * Create authentication middleware
   */
  static auth(
    authenticator: (request: NextRequest) => Promise<{ valid: boolean; user?: any }>
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const result = await authenticator(request)
      
      if (!result.valid) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      context.user = result.user
    }
  }

  /**
   * Create CORS middleware
   */
  static cors(options: {
    origin?: string | string[]
    methods?: string[]
    headers?: string[]
  } = {}): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const origin = request.headers.get('origin')
      
      // Check if origin is allowed
      if (options.origin) {
        const allowed = Array.isArray(options.origin)
          ? options.origin.includes(origin || '')
          : options.origin === origin

        if (!allowed) {
          return NextResponse.json(
            { error: 'CORS not allowed' },
            { status: 403 }
          )
        }
      }

      // Store CORS headers in context
      context.corsHeaders = {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': (options.methods || ['GET', 'POST', 'PUT', 'DELETE']).join(', '),
        'Access-Control-Allow-Headers': (options.headers || ['Content-Type', 'Authorization']).join(', '),
      }
    }
  }

  /**
   * Create validation middleware
   */
  static validate<T>(
    validator: (data: any) => { valid: boolean; data?: T; errors?: string[] }
  ): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      try {
        const body = await request.json()
        const result = validator(body)

        if (!result.valid) {
          return NextResponse.json(
            { error: 'Validation failed', errors: result.errors },
            { status: 400 }
          )
        }

        context.validatedData = result.data
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid JSON' },
          { status: 400 }
        )
      }
    }
  }

  /**
   * Create caching middleware
   */
  static cache(options: {
    ttl: number
    key: (request: NextRequest) => string
    get: (key: string) => Promise<any>
    set: (key: string, value: any, ttl: number) => Promise<void>
  }): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const key = options.key(request)
      const cached = await options.get(key)

      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT' },
        })
      }

      context.cacheKey = key
      context.cacheTTL = options.ttl
      context.cacheSet = options.set
    }
  }

  /**
   * Create timeout middleware
   */
  static timeout(ms: number): MiddlewareFunction {
    return async (request: NextRequest, context: MiddlewareContext) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), ms)

      context.abortController = controller
      context.timeoutId = timeoutId
      context.cleanup = () => clearTimeout(timeoutId)
    }
  }
}
