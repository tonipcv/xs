/**
 * Team Permissions API
 * Check and manage user permissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

// Permission matrix
const PERMISSIONS = {
  OWNER: {
    datasets: ['create', 'read', 'update', 'delete'],
    policies: ['create', 'read', 'update', 'delete'],
    leases: ['create', 'read', 'update', 'delete'],
    members: ['invite', 'read', 'update', 'remove'],
    billing: ['read', 'update'],
    webhooks: ['create', 'read', 'update', 'delete'],
    audit: ['read', 'export'],
    settings: ['read', 'update'],
  },
  ADMIN: {
    datasets: ['create', 'read', 'update', 'delete'],
    policies: ['create', 'read', 'update', 'delete'],
    leases: ['create', 'read', 'update', 'delete'],
    members: ['invite', 'read', 'update', 'remove'],
    billing: ['read'],
    webhooks: ['create', 'read', 'update', 'delete'],
    audit: ['read', 'export'],
    settings: ['read'],
  },
  EDITOR: {
    datasets: ['create', 'read', 'update'],
    policies: ['create', 'read', 'update'],
    leases: ['create', 'read'],
    members: ['read'],
    billing: [],
    webhooks: ['read'],
    audit: ['read'],
    settings: [],
  },
  VIEWER: {
    datasets: ['read'],
    policies: ['read'],
    leases: ['read'],
    members: ['read'],
    billing: [],
    webhooks: ['read'],
    audit: [],
    settings: [],
  },
};

/**
 * GET /api/team/permissions
 * Get current user's permissions
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        xaseRole: true,
        tenantId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const role = user.xaseRole || 'VIEWER';
    const permissions = PERMISSIONS[role as keyof typeof PERMISSIONS] || PERMISSIONS.VIEWER;

    return NextResponse.json({
      userId: user.id,
      role,
      permissions,
      hasTenant: !!user.tenantId,
    });
  } catch (error: any) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/team/permissions/check
 * Check if user has specific permission
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        xaseRole: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { resource, action } = body;

    if (!resource || !action) {
      return NextResponse.json(
        { error: 'Resource and action are required' },
        { status: 400 }
      );
    }

    const role = user.xaseRole || 'VIEWER';
    const permissions = PERMISSIONS[role as keyof typeof PERMISSIONS] || PERMISSIONS.VIEWER;
    const resourcePermissions = permissions[resource as keyof typeof permissions] || [];
    const hasPermission = (resourcePermissions as string[]).includes(action);

    return NextResponse.json({
      resource,
      action,
      role,
      hasPermission,
    });
  } catch (error: any) {
    console.error('Error checking permission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
