/**
 * Centralized Authentication Middleware
 * 
 * Provides unified authentication for API routes supporting both:
 * - API Key authentication (for programmatic access)
 * - Session authentication (for web UI)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';

export interface AuthContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  authType: 'api_key' | 'session';
  permissions?: string[];
}

export interface AuthMiddlewareOptions {
  requireApiKey?: boolean;
  requireSession?: boolean;
  rateLimit?: {
    limit: number;
    windowSeconds: number;
  };
  requiredPermissions?: string[];
}

/**
 * Unified authentication middleware
 * Supports both API key and session-based authentication
 */
export async function withAuth(
  req: NextRequest,
  options: AuthMiddlewareOptions = {}
): Promise<{ success: true; context: AuthContext } | { success: false; response: NextResponse }> {
  const {
    requireApiKey = false,
    requireSession = false,
    rateLimit,
    requiredPermissions = [],
  } = options;

  // Try API Key authentication first
  const apiAuth = await validateApiKey(req);
  
  if (apiAuth.valid && apiAuth.tenantId && apiAuth.apiKeyId) {
    // Check rate limit if configured
    if (rateLimit) {
      const rl = await checkApiRateLimit(
        apiAuth.apiKeyId,
        rateLimit.limit,
        rateLimit.windowSeconds
      );
      if (!rl.allowed) {
        return {
          success: false,
          response: NextResponse.json(
            { error: 'Rate limit exceeded', resetAt: rl.resetAt },
            { status: 429 }
          ),
        };
      }
    }

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(
        (perm) => apiAuth.permissions?.includes(perm)
      );
      if (!hasAllPermissions) {
        return {
          success: false,
          response: NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          ),
        };
      }
    }

    return {
      success: true,
      context: {
        tenantId: apiAuth.tenantId,
        apiKeyId: apiAuth.apiKeyId,
        authType: 'api_key',
        permissions: apiAuth.permissions,
      },
    };
  }

  // If API key required but not valid, fail
  if (requireApiKey) {
    return {
      success: false,
      response: NextResponse.json(
        { error: apiAuth.error || 'API key required' },
        { status: 401 }
      ),
    };
  }

  // Try session authentication
  const session = await getServerSession(authOptions);
  
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        tenantId: true,
        xaseRole: true,
      },
    });

    if (user?.tenantId) {
      return {
        success: true,
        context: {
          tenantId: user.tenantId,
          userId: user.id,
          authType: 'session',
          permissions: [], // Session-based auth uses role-based permissions
        },
      };
    }
  }

  // If session required but not valid, fail
  if (requireSession) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  // Neither auth method succeeded
  return {
    success: false,
    response: NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    ),
  };
}

/**
 * Helper to extract auth context from request
 * Use this in API routes that need flexible authentication
 */
export async function getAuthContext(
  req: NextRequest,
  options: AuthMiddlewareOptions = {}
): Promise<AuthContext | null> {
  const result = await withAuth(req, options);
  return result.success ? result.context : null;
}

/**
 * Wrapper for API routes that require authentication
 * Usage:
 * 
 * export const POST = withAuthHandler(async (req, context) => {
 *   // context.tenantId is guaranteed to exist
 *   // context.authType tells you how they authenticated
 *   return NextResponse.json({ success: true });
 * }, { rateLimit: { limit: 100, windowSeconds: 60 } });
 */
export function withAuthHandler(
  handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthMiddlewareOptions = {}
) {
  return async (req: NextRequest) => {
    const authResult = await withAuth(req, options);
    
    if (!authResult.success) {
      return authResult.response;
    }

    try {
      return await handler(req, authResult.context);
    } catch (error) {
      console.error('[AuthMiddleware] Handler error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
