/**
 * Team Invitation Acceptance API
 * Handles invitation token validation and acceptance
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * GET /api/team/invitations/:token
 * Validate invitation token
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Look up invitation in audit logs
    const invitation = await prisma.auditLog.findFirst({
      where: {
        action: 'MEMBER_INVITED',
        metadata: {
          contains: params.token,
        },
      },
      select: {
        metadata: true,
        timestamp: true,
        tenantId: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    const metadata = JSON.parse(invitation.metadata || '{}');
    const expiresAt = new Date(metadata.expiresAt);

    // Check if expired
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      );
    }

    // Check if already accepted
    const existingUser = await prisma.user.findUnique({
      where: { email: metadata.email },
    });

    if (existingUser?.tenantId === invitation.tenantId) {
      return NextResponse.json(
        { error: 'Invitation already accepted' },
        { status: 400 }
      );
    }

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: invitation.tenantId! },
    });

    return NextResponse.json({
      valid: true,
      email: metadata.email,
      role: metadata.role,
      tenantName: tenant?.name,
      expiresAt: metadata.expiresAt,
    });
  } catch (error: any) {
    console.error('Error validating invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/team/invitations/:token
 * Accept invitation and join tenant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Must be logged in to accept invitation' },
        { status: 401 }
      );
    }

    // Look up invitation
    const invitation = await prisma.auditLog.findFirst({
      where: {
        action: 'MEMBER_INVITED',
        metadata: {
          contains: params.token,
        },
      },
      select: {
        metadata: true,
        timestamp: true,
        tenantId: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    const metadata = JSON.parse(invitation.metadata || '{}');
    const expiresAt = new Date(metadata.expiresAt);

    // Check if expired
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      );
    }

    // Verify email matches
    if (session.user.email !== metadata.email) {
      return NextResponse.json(
        { error: 'Invitation is for a different email address' },
        { status: 403 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already in a tenant
    if (user.tenantId) {
      return NextResponse.json(
        { error: 'You are already a member of an organization' },
        { status: 400 }
      );
    }

    // Accept invitation - add user to tenant
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tenantId: invitation.tenantId,
        xaseRole: metadata.role,
      },
    });

    // Log acceptance
    await prisma.auditLog.create({
      data: {
        tenantId: invitation.tenantId,
        userId: user.id,
        action: 'MEMBER_JOINED',
        resourceType: 'user',
        resourceId: user.id,
        metadata: JSON.stringify({
          invitationId: metadata.invitationId,
          email: metadata.email,
          role: metadata.role,
          acceptedAt: new Date().toISOString(),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Successfully joined organization',
      role: metadata.role,
    });
  } catch (error: any) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
