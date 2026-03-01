/**
 * Team Member Management API - Individual Member Operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * GET /api/team/members/:id
 * Get a specific member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
        tenantId: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const member = await prisma.user.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        xaseRole: true,
        language: true,
        region: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ member });
  } catch (error: any) {
    console.error('Error fetching member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/team/members/:id
 * Update a member's role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Only admins and owners can update roles
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const member = await prisma.user.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent changing owner role
    if (member.xaseRole === 'OWNER') {
      return NextResponse.json(
        { error: 'Cannot change owner role' },
        { status: 403 }
      );
    }

    // Prevent non-owners from creating admins
    if (user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can assign admin role' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role } = body;

    // Validate role
    const validRoles = ['VIEWER', 'EDITOR', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Update member role
    const updatedMember = await prisma.user.update({
      where: { id: params.id },
      data: {
        xaseRole: role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        xaseRole: true,
        updatedAt: true,
      },
    });

    // Log the change
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'MEMBER_ROLE_UPDATED',
        resourceType: 'user',
        resourceId: params.id,
        metadata: JSON.stringify({
          memberId: params.id,
          memberEmail: member.email,
          oldRole: member.xaseRole,
          newRole: role,
          updatedBy: session.user.email,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ member: updatedMember });
  } catch (error: any) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/team/members/:id
 * Remove a member from the tenant
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Only admins and owners can remove members
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const member = await prisma.user.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent removing owner
    if (member.xaseRole === 'OWNER') {
      return NextResponse.json(
        { error: 'Cannot remove owner' },
        { status: 403 }
      );
    }

    // Prevent removing self
    if (member.id === user.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself' },
        { status: 403 }
      );
    }

    // Remove member from tenant (set tenantId to null)
    await prisma.user.update({
      where: { id: params.id },
      data: {
        tenantId: null,
        xaseRole: 'VIEWER',
      },
    });

    // Log the removal
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'MEMBER_REMOVED',
        resourceType: 'user',
        resourceId: params.id,
        metadata: JSON.stringify({
          memberId: params.id,
          memberEmail: member.email,
          memberRole: member.xaseRole,
          removedBy: session.user.email,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
