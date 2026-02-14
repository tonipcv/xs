// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreatePolicySchema = z.object({
  datasetId: z.string().min(1),
  clientTenantId: z.string().min(1),
  usagePurpose: z.string().min(1),
  maxHours: z.number().positive().optional(),
  maxDownloads: z.number().int().positive().optional(),
  pricePerHour: z.number().nonnegative(),
  currency: z.string().default('USD'),
  expiresAt: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await req.json()
    const parsed = CreatePolicySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: parsed.error.flatten() 
      }, { status: 400 })
    }

    const { datasetId, clientTenantId, usagePurpose, maxHours, maxDownloads, pricePerHour, currency, expiresAt } = parsed.data

    // Verificar se dataset pertence ao tenant
    const dataset = await prisma.dataset.findFirst({
      where: { 
        datasetId,
        tenantId: user.tenantId,
      },
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found or not owned by you' }, { status: 404 })
    }

    // Verificar se client tenant existe
    const clientTenant = await prisma.tenant.findUnique({
      where: { id: clientTenantId },
    })

    if (!clientTenant) {
      return NextResponse.json({ error: 'Client tenant not found' }, { status: 404 })
    }

    // Criar policy
    const policyId = `pol_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    
    const policy = await prisma.voiceAccessPolicy.create({
      data: {
        policyId,
        datasetId: dataset.id,
        clientTenantId,
        status: 'ACTIVE',
        usagePurpose,
        maxHours: maxHours || null,
        maxDownloads: maxDownloads || null,
        pricePerHour,
        currency,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        hoursConsumed: 0,
        downloadsCount: 0,
      },
    })

    return NextResponse.json({ 
      success: true,
      policy: {
        id: policy.id,
        policyId: policy.policyId,
        status: policy.status,
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error('[API] policies POST error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
