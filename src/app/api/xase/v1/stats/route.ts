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

    // Checkpoints stats
    const [totalCheckpoints, lastCheckpoint] = await Promise.all([
      prisma.checkpointRecord.count({ where: { tenantId } }),
      prisma.checkpointRecord.findFirst({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        select: {
          timestamp: true,
          checkpointNumber: true,
          isVerified: true,
        },
      }),
    ]);

    // Exports count (via audit log)
    const totalExports = await prisma.auditLog.count({
      where: {
        tenantId,
        action: 'EXPORT_CREATED',
      },
    });

    // Integrity check (simplified)
    const integrityStatus = lastCheckpoint?.isVerified ? 'VERIFIED' : 'PENDING';

    // 3. Retornar stats
    return NextResponse.json({
      records: {
        total: totalRecords,
        today: todayRecords,
        thisWeek: weekRecords,
      },
      checkpoints: {
        total: totalCheckpoints,
        lastCreated: lastCheckpoint?.timestamp?.toISOString() || null,
        lastNumber: lastCheckpoint?.checkpointNumber || null,
      },
      exports: {
        total: totalExports,
      },
      integrity: {
        status: integrityStatus,
        lastCheck: lastCheckpoint?.timestamp?.toISOString() || null,
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
