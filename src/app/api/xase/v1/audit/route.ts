/**
 * XASE CORE - Audit Log API
 * 
 * GET /api/xase/v1/audit - Listar audit logs com paginação e filtros
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const tenantId = auth.tenantId!;
    const { searchParams } = new URL(request.url);

    // 2. Parse query params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const action = searchParams.get('action') || '';
    const resourceType = searchParams.get('resourceType') || '';

    // 3. Build where clause
    const where: any = { tenantId };
    
    if (action) {
      where.action = action;
    }
    
    if (resourceType) {
      where.resourceType = resourceType;
    }

    // 4. Fetch audit logs with pagination
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          status: true,
          errorMessage: true,
          timestamp: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // 5. Return paginated response
    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing audit logs:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
