// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { z } from 'zod'

const RewriteRulesSchema = z.object({
  allowedColumns: z.array(z.string()).optional(),
  deniedColumns: z.array(z.string()).optional(),
  rowFilters: z.record(z.any()).optional(),
  maskingRules: z.record(z.string()).optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { policyId } = await params
    const body = await req.json()
    const parsed = RewriteRulesSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid rewrite rules', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { allowedColumns, deniedColumns, rowFilters, maskingRules } = parsed.data

    // Verify policy exists and belongs to tenant
    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: {
        policyId,
        OR: [
          { dataset: { tenantId: auth.tenantId } }, // Supplier owns dataset
          { clientTenantId: auth.tenantId }, // Client owns policy
        ],
      },
    })

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    }

    // Update rewrite rules
    const updated = await prisma.voiceAccessPolicy.update({
      where: { id: policy.id },
      data: {
        allowedColumns: allowedColumns || [],
        deniedColumns: deniedColumns || [],
        rowFilters: rowFilters ? JSON.parse(JSON.stringify(rowFilters)) : null,
        maskingRules: maskingRules ? JSON.parse(JSON.stringify(maskingRules)) : null,
      },
      select: {
        policyId: true,
        allowedColumns: true,
        deniedColumns: true,
        rowFilters: true,
        maskingRules: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      policy: updated,
    })
  } catch (error: any) {
    console.error('[API] PUT /policies/:policyId/rewrite-rules error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { policyId } = await params

    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: {
        policyId,
        OR: [
          { dataset: { tenantId: auth.tenantId } },
          { clientTenantId: auth.tenantId },
        ],
      },
      select: {
        policyId: true,
        allowedColumns: true,
        deniedColumns: true,
        rowFilters: true,
        maskingRules: true,
        updatedAt: true,
      },
    })

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    }

    return NextResponse.json(policy)
  } catch (error: any) {
    console.error('[API] GET /policies/:policyId/rewrite-rules error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
