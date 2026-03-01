/**
 * Members API - List and manage organization members
 * F2-002: RBAC UI - Gestão de Membros
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { listMembers } from '@/lib/rbac/member-management';

/**
 * GET /api/members
 * List all members of the organization
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing required parameter: tenantId' },
        { status: 400 }
      );
    }

    const members = await listMembers(tenantId);

    return NextResponse.json({ members });
  } catch (error: any) {
    console.error('Error listing members:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list members' },
      { status: 500 }
    );
  }
}
