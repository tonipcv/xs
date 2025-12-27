import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/xase/server-auth';
import { encodeCursor, parseCursor } from '@/lib/table-utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = parseCursor(searchParams.get('cursor') || undefined);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const sortField = searchParams.get('sortField') || 'checkpointNumber';
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
    const limit = 20;

    // Build where clause
    const where: any = { tenantId };

    if (search) {
      where.checkpointId = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where.isVerified = status === 'verified';
    }

    // Cursor pagination
    const cursorClause = cursor ? { id: cursor } : undefined;

    const [checkpoints, total] = await Promise.all([
      prisma.checkpointRecord.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursorClause,
        select: {
          id: true,
          checkpointId: true,
          checkpointNumber: true,
          recordCount: true,
          isVerified: true,
          timestamp: true,
          signatureAlgo: true,
        },
      }),
      prisma.checkpointRecord.count({ where }),
    ]);

    const hasMore = checkpoints.length > limit;
    const data = hasMore ? checkpoints.slice(0, limit) : checkpoints;
    const nextCursor = hasMore ? encodeCursor(data[data.length - 1].id) : undefined;

    return NextResponse.json({
      checkpoints: data,
      total,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching checkpoints:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
