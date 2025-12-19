/**
 * XASE CORE - Checkpoints API
 * 
 * GET /api/xase/v1/checkpoints - Listar checkpoints com paginação
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

    // 3. Fetch checkpoints with pagination
    const [checkpoints, total] = await Promise.all([
      prisma.checkpointRecord.findMany({
        where: { tenantId },
        orderBy: { checkpointNumber: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          checkpointId: true,
          checkpointNumber: true,
          checkpointType: true,
          recordCount: true,
          checkpointHash: true,
          signature: true,
          signatureAlgo: true,
          keyId: true,
          isVerified: true,
          verifiedAt: true,
          timestamp: true,
          previousCheckpointId: true,
        },
      }),
      prisma.checkpointRecord.count({ where: { tenantId } }),
    ]);

    // 4. Return paginated response
    return NextResponse.json({
      checkpoints,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing checkpoints:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
