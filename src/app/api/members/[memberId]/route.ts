/**
 * Member Management API - Update and Delete
 * F2-002: RBAC UI - Gestão de Membros
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { removeMember, updateMemberRole } from '@/lib/rbac/member-management';

/**
 * DELETE /api/members/[memberId]
 * Remove a member from the organization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = params;

    await removeMember(memberId, session.user.email);

    return NextResponse.json({ success: true, message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove member' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/members/[memberId]
 * Update member role or permissions
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = params;
    const body = await request.json();
    const { role, permissions } = body;

    if (!role && !permissions) {
      return NextResponse.json(
        { error: 'Missing required fields: role or permissions' },
        { status: 400 }
      );
    }

    await updateMemberRole(memberId, role, permissions, session.user.email);

    return NextResponse.json({ success: true, message: 'Member updated successfully' });
  } catch (error: any) {
    console.error('Error updating member:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update member' },
      { status: 500 }
    );
  }
}
