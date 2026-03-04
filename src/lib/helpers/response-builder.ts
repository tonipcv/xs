/**
 * RESPONSE BUILDER
 * Build consistent API responses
 */

import { NextResponse } from 'next/server'

export interface ApiResponseData<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
  timestamp?: string
}

export class ResponseBuilder {
  /**
   * Success response
   */
  static success<T>(data: T, meta?: ApiResponseData['meta']): NextResponse {
    const response: ApiResponseData<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }

    if (meta) {
      response.meta = meta
    }

    return NextResponse.json(response, { status: 200 })
  }

  /**
   * Created response
   */
  static created<T>(data: T): NextResponse {
    return NextResponse.json(
      {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    )
  }

  /**
   * No content response
   */
  static noContent(): NextResponse {
    return new NextResponse(null, { status: 204 })
  }

  /**
   * Error response
   */
  static error(message: string, status: number = 500): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status }
    )
  }

  /**
   * Bad request
   */
  static badRequest(message: string = 'Bad request'): NextResponse {
    return this.error(message, 400)
  }

  /**
   * Unauthorized
   */
  static unauthorized(message: string = 'Unauthorized'): NextResponse {
    return this.error(message, 401)
  }

  /**
   * Forbidden
   */
  static forbidden(message: string = 'Forbidden'): NextResponse {
    return this.error(message, 403)
  }

  /**
   * Not found
   */
  static notFound(message: string = 'Not found'): NextResponse {
    return this.error(message, 404)
  }

  /**
   * Conflict
   */
  static conflict(message: string = 'Conflict'): NextResponse {
    return this.error(message, 409)
  }

  /**
   * Validation error
   */
  static validationError(errors: Record<string, string>): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        errors,
        timestamp: new Date().toISOString(),
      },
      { status: 422 }
    )
  }

  /**
   * Rate limit exceeded
   */
  static rateLimitExceeded(retryAfter?: number): NextResponse {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        timestamp: new Date().toISOString(),
      },
      { status: 429 }
    )

    if (retryAfter) {
      response.headers.set('Retry-After', String(retryAfter))
    }

    return response
  }

  /**
   * Paginated response
   */
  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): NextResponse {
    return this.success(data, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  }

  /**
   * With headers
   */
  static withHeaders(
    response: NextResponse,
    headers: Record<string, string>
  ): NextResponse {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value)
    }
    return response
  }

  /**
   * With CORS
   */
  static withCORS(
    response: NextResponse,
    origin: string = '*'
  ): NextResponse {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return response
  }

  /**
   * Redirect
   */
  static redirect(url: string, permanent: boolean = false): NextResponse {
    return NextResponse.redirect(url, { status: permanent ? 301 : 302 })
  }

  /**
   * Stream response
   */
  static stream(
    generator: AsyncGenerator<any>,
    contentType: string = 'application/json'
  ): Response {
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            const data = JSON.stringify(chunk) + '\n'
            controller.enqueue(encoder.encode(data))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': contentType,
        'Transfer-Encoding': 'chunked',
      },
    })
  }

  /**
   * File download
   */
  static download(
    data: string | Buffer,
    filename: string,
    contentType: string = 'application/octet-stream'
  ): Response {
    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  /**
   * JSON Lines response
   */
  static jsonLines(items: any[]): Response {
    const lines = items.map(item => JSON.stringify(item)).join('\n')
    
    return new Response(lines, {
      headers: {
        'Content-Type': 'application/x-ndjson',
      },
    })
  }
}
