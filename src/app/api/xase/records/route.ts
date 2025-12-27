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
    const policy = searchParams.get('policy') || undefined;
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const sortField = searchParams.get('sortField') || 'timestamp';
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
    const limit = 20;

    // Build where clause
    const where: any = { tenantId };

    if (search) {
      where.transactionId = { contains: search, mode: 'insensitive' };
    }

    if (policy) {
      where.policyId = policy;
    }

    if (type) {
      where.decisionType = type;
    }

    if (status) {
      where.isVerified = status === 'verified';
    }

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    // Cursor pagination
    const cursorClause = cursor ? { id: cursor } : undefined;

    const [records, total] = await Promise.all([
      prisma.decisionRecord.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursorClause,
        select: {
          id: true,
          transactionId: true,
          policyId: true,
          decisionType: true,
          confidence: true,
          isVerified: true,
          timestamp: true,
        },
      }),
      prisma.decisionRecord.count({ where }),
    ]);

    const hasMore = records.length > limit;
    const data = hasMore ? records.slice(0, limit) : records;
    const nextCursor = hasMore ? encodeCursor(data[data.length - 1].id) : undefined;

    return NextResponse.json({
      records: data,
      total,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
