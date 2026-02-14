/**
 * SECURITY MIDDLEWARE
 * 
 * Security headers, CORS, CSP, and other security best practices
 */

import { NextRequest, NextResponse } from 'next/server'

export interface SecurityConfig {
  cors?: {
    allowedOrigins: string[]
    allowedMethods: string[]
    allowedHeaders: string[]
    credentials: boolean
    maxAge: number
  }
  csp?: {
    directives: Record<string, string[]>
  }
  hsts?: {
    maxAge: number
    includeSubDomains: boolean
    preload: boolean
  }
}

/**
 * Security Headers Middleware
 */
export function securityHeaders(config?: SecurityConfig) {
  return function middleware(req: NextRequest) {
    const response = NextResponse.next()

    // CORS headers
    if (config?.cors) {
      const origin = req.headers.get('origin')
      
      if (origin && config.cors.allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Methods', config.cors.allowedMethods.join(', '))
        response.headers.set('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '))
        
        if (config.cors.credentials) {
          response.headers.set('Access-Control-Allow-Credentials', 'true')
        }
        
        response.headers.set('Access-Control-Max-Age', config.cors.maxAge.toString())
      }
    }

    // Content Security Policy
    if (config?.csp) {
      const cspDirectives = Object.entries(config.csp.directives)
        .map(([key, values]) => `${key} ${values.join(' ')}`)
        .join('; ')
      response.headers.set('Content-Security-Policy', cspDirectives)
    }

    // HTTP Strict Transport Security
    if (config?.hsts) {
      const hstsValue = [
        `max-age=${config.hsts.maxAge}`,
        config.hsts.includeSubDomains && 'includeSubDomains',
        config.hsts.preload && 'preload',
      ].filter(Boolean).join('; ')
      
      response.headers.set('Strict-Transport-Security', hstsValue)
    }

    // X-Frame-Options (prevent clickjacking)
    response.headers.set('X-Frame-Options', 'DENY')

    // X-Content-Type-Options (prevent MIME sniffing)
    response.headers.set('X-Content-Type-Options', 'nosniff')

    // X-XSS-Protection
    response.headers.set('X-XSS-Protection', '1; mode=block')

    // Referrer-Policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Permissions-Policy (formerly Feature-Policy)
    response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

    // Remove server header
    response.headers.delete('X-Powered-By')

    return response
  }
}

/**
 * Default security configuration
 */
export const defaultSecurityConfig: SecurityConfig = {
  cors: {
    allowedOrigins: [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400, // 24 hours
  },
  csp: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'https://api.xase.ai'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}

/**
 * IP Whitelist Middleware
 */
export function ipWhitelist(allowedIPs: string[]) {
  return function middleware(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                req.headers.get('x-real-ip') ||
                'unknown'

    if (!allowedIPs.includes(ip) && !allowedIPs.includes('*')) {
      return NextResponse.json(
        { error: 'IP not allowed' },
        { status: 403 }
      )
    }

    return NextResponse.next()
  }
}

/**
 * Request Size Limit Middleware
 */
export function requestSizeLimit(maxSizeBytes: number) {
  return async function middleware(req: NextRequest) {
    const contentLength = req.headers.get('content-length')

    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return NextResponse.json(
        { error: 'Request too large' },
        { status: 413 }
      )
    }

    return NextResponse.next()
  }
}

/**
 * API Key Validation Middleware
 */
export function requireApiKey() {
  return async function middleware(req: NextRequest) {
    const apiKey = req.headers.get('x-api-key')

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      )
    }

    // Validate API key (implement your logic)
    // const valid = await validateApiKey(apiKey)
    // if (!valid) {
    //   return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    // }

    return NextResponse.next()
  }
}

/**
 * Compose multiple middlewares
 */
export function composeMiddleware(...middlewares: Array<(req: NextRequest) => NextResponse | Promise<NextResponse>>) {
  return async function composed(req: NextRequest) {
    for (const middleware of middlewares) {
      const response = await middleware(req)
      if (response.status !== 200) {
        return response
      }
    }
    return NextResponse.next()
  }
}
