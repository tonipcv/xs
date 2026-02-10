// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Integration ID required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const name = (body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });
    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const integ = await prisma.cloudIntegration.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!integ) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }
    if (integ.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.cloudIntegration.update({ where: { id }, data: { name } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Rename integration error:', error);
    return NextResponse.json({ error: 'Failed to rename integration' }, { status: 500 });
  }
}
