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
    const claimType = searchParams.get('claimType') || undefined;
    const consumerImpact = searchParams.get('consumerImpact') || undefined;
    const sortField = searchParams.get('sortField') || 'timestamp';
    const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
    const limit = 20;

    // Build where clause
    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { transactionId: { contains: search, mode: 'insensitive' } },
        { insuranceDecision: { claimNumber: { contains: search, mode: 'insensitive' } } },
      ];
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

    if (claimType) {
      where.insuranceDecision = where.insuranceDecision || {};
      where.insuranceDecision.claimType = claimType;
    }

    if (consumerImpact) {
      where.insuranceDecision = where.insuranceDecision || {};
      where.insuranceDecision.decisionImpactConsumerImpact = consumerImpact;
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
          recordHash: true,
          insuranceDecision: {
            select: {
              claimNumber: true,
              claimType: true,
              claimAmount: true,
              policyNumber: true,
              decisionOutcome: true,
              decisionImpactConsumerImpact: true,
            },
          },
        },
      }),
      prisma.decisionRecord.count({ where }),
    ]);

    const hasMore = records.length > limit;
    const rawData = hasMore ? records.slice(0, limit) : records;

    // Serialize to plain objects and coerce Decimal to number
    const data = rawData.map((r: any) => {
      // Coerce confidence if Prisma Decimal
      let confidence: number | null = null;
      if (r.confidence != null) {
        try {
          const v: any = r.confidence;
          if (typeof v === 'object' && typeof v.toNumber === 'function') {
            const n = v.toNumber();
            confidence = Number.isFinite(n) ? n : null;
          } else {
            const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
            confidence = Number.isFinite(n) ? n : null;
          }
        } catch {
          confidence = null;
        }
      }

      const src = r.insuranceDecision;
      let coerced: number | null = null;
      if (src && src.claimAmount != null) {
        try {
          const v: any = src.claimAmount;
          if (typeof v === 'object' && typeof v.toNumber === 'function') {
            const n = v.toNumber();
            coerced = Number.isFinite(n) ? n : null;
          } else {
            const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v);
            coerced = Number.isFinite(n) ? n : null;
          }
        } catch {
          coerced = null;
        }
      }
      const ins = src
        ? {
            ...src,
            claimAmount: coerced,
          }
        : null;
      return {
        id: r.id,
        transactionId: r.transactionId,
        policyId: r.policyId,
        decisionType: r.decisionType ?? null,
        confidence,
        isVerified: r.isVerified,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
        recordHash: r.recordHash ?? null,
        insuranceDecision: ins,
      } as const;
    });
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
