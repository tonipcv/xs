import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import { z } from 'zod'

const BulkPolicySchema = z.object({
  policies: z.array(z.object({
    datasetId: z.string().min(1),
    clientTenantId: z.string().min(1),
    usagePurpose: z.string().min(1),
    maxHours: z.number().optional(),
    maxDownloads: z.number().optional(),
    canStream: z.boolean().default(false),
    canBatchDownload: z.boolean().default(false),
    allowedEnvironment: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
  })).min(1).max(100),
})

/**
 * Bulk Policy Operations
 * POST /api/v1/policies/bulk - Create multiple policies
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = BulkPolicySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { policies } = parsed.data
    const created: any[] = []
    const errors: any[] = []

    // Create policies in transaction
    await prisma.$transaction(async (tx) => {
      for (const policyData of policies) {
        try {
          // Verify dataset exists and belongs to tenant
          const dataset = await tx.dataset.findFirst({
            where: {
              datasetId: policyData.datasetId,
              tenantId: auth.tenantId,
            },
            select: { id: true },
          })

          if (!dataset) {
            errors.push({
              datasetId: policyData.datasetId,
              error: 'Dataset not found or access denied',
            })
            continue
          }

          const policy = await tx.accessPolicy.create({
            data: {
              policyId: `pol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              datasetId: dataset.id,
              clientTenantId: policyData.clientTenantId,
              usagePurpose: policyData.usagePurpose,
              maxHours: policyData.maxHours,
              maxDownloads: policyData.maxDownloads,
              canStream: policyData.canStream,
              canBatchDownload: policyData.canBatchDownload,
              allowedEnvironment: policyData.allowedEnvironment,
              expiresAt: policyData.expiresAt ? new Date(policyData.expiresAt) : null,
              status: 'ACTIVE',
            },
            select: {
              policyId: true,
              datasetId: true,
              clientTenantId: true,
              usagePurpose: true,
              status: true,
            },
          })

          created.push(policy)
        } catch (error: any) {
          errors.push({
            datasetId: policyData.datasetId,
            error: error.message,
          })
        }
      }
    })

    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors.length,
      policies: created,
      failedPolicies: errors,
    })
  } catch (error: any) {
    console.error('[API] Bulk policy creation error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/policies/bulk - Delete multiple policies
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const policyIds = z.array(z.string()).parse(body.policyIds)

    if (policyIds.length === 0 || policyIds.length > 100) {
      return NextResponse.json(
        { error: 'Must provide 1-100 policy IDs' },
        { status: 400 }
      )
    }

    const deleted = await prisma.accessPolicy.deleteMany({
      where: {
        policyId: { in: policyIds },
        dataset: { tenantId: auth.tenantId },
      },
    })

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
    })
  } catch (error: any) {
    console.error('[API] Bulk policy deletion error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
