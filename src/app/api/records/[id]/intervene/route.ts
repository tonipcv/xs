/**
 * Server-side handler para intervenção humana via UI
 * Autenticação via sessão (Next-Auth)
 * Não expõe API Key no browser
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantId } from '@/lib/xase/server-auth';
import { createIntervention, getInterventions } from '@/lib/xase/human-intervention';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const InterventionSchema = z.object({
  action: z.enum(['REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'OVERRIDE', 'ESCALATED']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  newOutcome: z.record(z.any()).optional(),
});

export const dynamic = 'force-dynamic';

/**
 * POST - Criar intervenção
 */
export async function POST(
  request: Request,
  { params }: any
) {
  try {
    // 1. Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    // 2. RBAC: verificar papel do usuário
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
      select: { xaseRole: true },
    });
    const role = dbUser?.xaseRole || 'VIEWER';
    const allowedPostRoles = ['OWNER', 'ADMIN', 'REVIEWER'];
    if (!allowedPostRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Insufficient role for intervention', code: 'FORBIDDEN', required_role: 'REVIEWER' },
        { status: 403 }
      );
    }

    // 3. Extrair transaction ID
    const { id } = await params;
    const transactionId = id;

    // 4. Validar payload
    const body = await request.json();
    const validation = InterventionSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid payload',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }
    
    const data = validation.data;

    // 5. Capturar contexto do usuário
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 6. Criar intervenção
    const result = await createIntervention({
      transactionId,
      tenantId,
      action: data.action as any,
      actorUserId: session.user.id,
      actorName: session.user.name || undefined,
      actorEmail: session.user.email,
      actorRole: role,
      reason: data.reason,
      notes: data.notes,
      metadata: data.metadata,
      newOutcome: data.newOutcome,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      intervention_id: result.interventionId,
      intervention: result.intervention,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[Intervention UI] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET - Listar intervenções
 */
export async function GET(
  request: Request,
  { params }: any
) {
  try {
    // 1. Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    // 2. RBAC: permitir VIEWER+
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
      select: { xaseRole: true },
    });
    const role = dbUser?.xaseRole || 'VIEWER';
    const allowedGetRoles = ['OWNER', 'ADMIN', 'REVIEWER', 'VIEWER'];
    if (!allowedGetRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Insufficient role to list interventions', code: 'FORBIDDEN', required_role: 'VIEWER' },
        { status: 403 }
      );
    }

    // 3. Extrair transaction ID
    const { id } = await params;
    const transactionId = id;

    // 4. Buscar intervenções
    const interventions = await getInterventions(transactionId, tenantId);

    // 5. Retornar lista
    return NextResponse.json({
      transaction_id: transactionId,
      interventions: interventions.map(i => ({
        id: i.id,
        action: i.action,
        actor: {
          userId: i.actorUserId,
          name: i.actorName,
          email: i.actorEmail,
          role: i.actorRole,
        },
        reason: i.reason,
        notes: i.notes,
        metadata: i.metadata ? JSON.parse(i.metadata) : null,
        newOutcome: i.newOutcome ? JSON.parse(i.newOutcome) : null,
        previousOutcome: i.previousOutcome ? JSON.parse(i.previousOutcome) : null,
        timestamp: i.timestamp,
      })),
      total: interventions.length,
    });

  } catch (error: any) {
    console.error('[Intervention UI] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
