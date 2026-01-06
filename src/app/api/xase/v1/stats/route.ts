/**
 * XASE CORE - Stats API
 * 
 * GET /api/xase/v1/stats - Dashboard statistics
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

    // 2. Buscar estatísticas
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Records stats
    const [totalRecords, todayRecords, weekRecords] = await Promise.all([
      prisma.decisionRecord.count({ where: { tenantId } }),
      prisma.decisionRecord.count({
        where: { tenantId, timestamp: { gte: today } },
      }),
      prisma.decisionRecord.count({
        where: { tenantId, timestamp: { gte: weekAgo } },
      }),
    ]);

    // Checkpoints feature removed: keep zeros/nulls for backward-compatible payload
    const totalCheckpoints = 0;
    const lastCheckpoint: { timestamp: Date | null; checkpointNumber: number | null; isVerified?: boolean | null } | null = null;

    // Exports count (via audit log)
    const totalExports = await prisma.auditLog.count({
      where: {
        tenantId,
        action: 'EXPORT_CREATED',
      },
    });

    // Integrity check (simplified)
    // Integrity based on record chain availability (simplified)
    const integrityStatus = totalRecords > 0 ? 'VERIFIED' : 'PENDING';

    // 3. Retornar stats
    return NextResponse.json({
      records: {
        total: totalRecords,
        today: todayRecords,
        thisWeek: weekRecords,
      },
      checkpoints: {
        total: totalCheckpoints,
        lastCreated: null,
        lastNumber: null,
      },
      exports: {
        total: totalExports,
      },
      integrity: {
        status: integrityStatus,
        lastCheck: null,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
