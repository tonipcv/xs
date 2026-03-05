/**
 * Member Invitation API
 * F2-002 & F2-012: RBAC UI - Gestão de Membros
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { inviteMember } from '@/lib/rbac/member-management';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/members/invite
 * Invite a new member to the organization
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email, role, customRoleId, tenantId, message } = body;

    if (!email || !role || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required fields: email, role, tenantId' },
        { status: 400 }
      );
    }

    // Get user ID from session
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await inviteMember({
      email,
      role,
      customRoleId,
      tenantId,
      invitedBy: user.id,
      message,
    });

    return NextResponse.json(
      {
        success: true,
        inviteToken: result.substring(0, 8) + '...',
        message: 'Invitation sent successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error inviting member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to invite member' },
      { status: 500 }
    );
  }
}
