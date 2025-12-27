import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantContext } from '@/lib/xase/server-auth';
import { encodeCursor, parseCursor } from '@/lib/table-utils';
import { requireTenant, UnauthorizedError } from '@/lib/xase/rbac';

export async function GET(request: NextRequest) {
  try {
    // RBAC: Obter contexto e validar tenant
    const ctx = await getTenantContext();
    
    try {
      requireTenant(ctx);
      // Listagem permitida para todos os papéis (OWNER, ADMIN, VIEWER)
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      throw error;
    }

    const tenantId = ctx.tenantId!;

    const { searchParams } = new URL(request.url);
    const cursor = parseCursor(searchParams.get('cursor') || undefined);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const sortField = searchParams.get('sortField') || 'createdAt';
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
    const limit = 20;

    // Build where clause
    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { bundleId: { contains: search, mode: 'insensitive' } },
        { purpose: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    // Cursor pagination
    const cursorClause = cursor ? { id: cursor } : undefined;

    const [bundles, total] = await Promise.all([
      prisma.evidenceBundle.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursorClause,
        select: {
          id: true,
          bundleId: true,
          status: true,
          recordCount: true,
          purpose: true,
          createdBy: true,
          createdAt: true,
          completedAt: true,
          expiresAt: true,
        },
      }),
      prisma.evidenceBundle.count({ where }),
    ]);

    const hasMore = bundles.length > limit;
    const data = hasMore ? bundles.slice(0, limit) : bundles;
    const nextCursor = hasMore ? encodeCursor(data[data.length - 1].id) : undefined;

    return NextResponse.json({
      bundles: data,
      total,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching bundles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
