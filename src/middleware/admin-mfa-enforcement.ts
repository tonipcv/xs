// @ts-nocheck
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma';

const ADMIN_ROUTES = [
  '/api/v1/admin',
  '/api/v1/tenants',
  '/api/v1/users/roles',
  '/api/v1/break-glass',
  '/admin',
];

const MFA_EXEMPT_ROUTES = [
  '/api/v1/auth/mfa/setup',
  '/api/v1/auth/mfa/verify',
  '/api/health',
];

export async function adminMFAEnforcement(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if this is an admin route
  const isAdminRoute = ADMIN_ROUTES.some(route => pathname.startsWith(route));
  
  if (!isAdminRoute) {
    return null; // Not an admin route, continue
  }

  // Check if route is MFA-exempt
  const isExempt = MFA_EXEMPT_ROUTES.some(route => pathname.startsWith(route));
  
  if (isExempt) {
    return null; // Exempt route, continue
  }

  // Get session token
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.email) {
    return NextResponse.json(
      { error: 'Unauthorized - Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Get user with role information
    const user = await prisma.user.findUnique({
      where: { email: token.email as string },
      select: {
        id: true,
        role: true,
        mfaEnabled: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is admin
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Enforce MFA for admins
    if (!user.mfaEnabled) {
      return NextResponse.json(
        {
          error: 'MFA Required',
          message: 'Multi-factor authentication is required for admin access',
          action: 'setup_mfa',
          setupUrl: '/api/v1/auth/mfa/setup',
        },
        { status: 403 }
      );
    }

    // Check if MFA was verified in this session
    const mfaVerified = token.mfaVerified === true;

    if (!mfaVerified) {
      return NextResponse.json(
        {
          error: 'MFA Verification Required',
          message: 'Please verify your MFA token to access admin features',
          action: 'verify_mfa',
          verifyUrl: '/api/v1/auth/mfa/verify',
        },
        { status: 403 }
      );
    }

    // MFA verified, allow access
    return null;

  } catch (error: any) {
    console.error('MFA enforcement error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
