// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getPresignedUrl } from '@/lib/xase/storage'
import { z } from 'zod'

const BodySchema = z.object({
  files: z.array(z.string().min(1)).nonempty(),
  hoursRequested: z.number().nonnegative().optional(),
  requestId: z.string().min(1).optional(),
})

export async function POST(req: NextRequest, context: any) {
  try {
    const { params } = context as { params: Promise<{ datasetId: string }> }
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId || !auth.apiKeyId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    // Rate limit API key
    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 900, 60) // 900 req/h
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { datasetId } = await params
    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { files, hoursRequested = 0, requestId } = parsed.data

    if (!files.length) {
      return NextResponse.json({ error: 'files is required (array of object keys)' }, { status: 400 })
    }

    // 1) Dataset deve estar ACTIVE
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: {
        id: true,
        datasetId: true,
        tenantId: true,
        status: true,
        storageLocation: true,
        language: true,
      },
    })
    if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    if (dataset.status !== 'ACTIVE') return NextResponse.json({ error: 'Dataset not active' }, { status: 400 })

    // 2) Policy ativa para o CLIENT (tenant do auth)
    const now = new Date()
    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: {
        datasetId: dataset.id,
        clientTenantId: auth.tenantId,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: now } },
        ],
      },
      select: {
        id: true,
        policyId: true,
        maxHours: true,
        hoursConsumed: true,
        maxDownloads: true,
        downloadsCount: true,
        pricePerHour: true,
        currency: true,
        canBatchDownload: true,
      },
    })
    if (!policy) return NextResponse.json({ error: 'No active policy for this dataset' }, { status: 403 })
    if (!policy.canBatchDownload) return NextResponse.json({ error: 'Batch download not allowed by policy' }, { status: 403 })

    // 3) Enforce quotas
    const nextDownloads = (policy.downloadsCount ?? 0) + 1
    if (policy.maxDownloads && nextDownloads > policy.maxDownloads) {
      return NextResponse.json({ error: 'Download limit exceeded' }, { status: 403 })
    }

    let hoursToDebit = hoursRequested
    if (hoursToDebit <= 0) {
      // fallback simples: 0.5h por requisição
      hoursToDebit = 0.5
    }

    const nextHours = (policy.hoursConsumed ?? 0) + hoursToDebit
    if (policy.maxHours && nextHours > policy.maxHours) {
      return NextResponse.json({ error: 'Quota exceeded (hours)' }, { status: 403 })
    }

    // 4) Idempotência básica por requestId (opcional)
    if (requestId) {
      const existing = await prisma.voiceAccessLog.findFirst({ where: { requestId } })
      if (existing) {
        return NextResponse.json({
          accessGranted: true,
          reused: true,
          downloadUrls: [],
          expiresIn: 3600,
        })
      }
    }

    // 5) Gerar URLs assinadas (somente para chaves sob storageLocation)
    const safeKeys = files.filter(k => typeof k === 'string' && k.startsWith(dataset.storageLocation || ''))
    if (!safeKeys.length) {
      return NextResponse.json({ error: 'No valid fileKeys under dataset storage location' }, { status: 400 })
    }

    const expiresIn = 3600
    const downloadUrls: string[] = []
    for (const key of safeKeys) {
      try {
        const url = await getPresignedUrl(key, expiresIn)
        downloadUrls.push(url)
      } catch (e) {
        // pular chaves inválidas
      }
    }

    // 6) Persistir efeitos (transação): atualizar policy, registrar log e lançar débito no ledger
    const unitPrice = Number(policy.pricePerHour ?? 0)
    const amount = unitPrice * hoursToDebit * -1 // débito

    await prisma.$transaction(async (tx) => {
      // Policy counters
      await tx.voiceAccessPolicy.update({
        where: { id: policy.id },
        data: {
          hoursConsumed: nextHours,
          downloadsCount: nextDownloads,
          lastAccessAt: new Date(),
        },
      })

      // Ledger (append-only)
      const currentBalanceAgg = await tx.creditLedger.aggregate({
        _sum: { amount: true },
        where: { tenantId: auth.tenantId },
      })
      const currentBalance = Number((currentBalanceAgg._sum?.amount as any) ?? 0)
      const balanceAfter = currentBalance + amount
      await tx.creditLedger.create({
        data: {
          tenantId: auth.tenantId,
          amount,
          eventType: 'USAGE_DEBIT',
          description: `Dataset ${dataset.datasetId} access: ${hoursToDebit}h @ ${unitPrice}/${policy.currency ?? 'USD'}`,
          balanceAfter,
          metadata: { datasetId: dataset.datasetId, files: safeKeys } as any,
        } as any,
      })

      // Access log (imutável)
      await tx.voiceAccessLog.create({
        data: {
          datasetId: dataset.id,
          policyId: policy.id,
          clientTenantId: auth.tenantId as string,
          userId: null,
          apiKeyId: auth.apiKeyId as string,
          action: 'BATCH_DOWNLOAD',
          filesAccessed: safeKeys.length,
          hoursAccessed: hoursToDebit,
          bytesTransferred: null,
          outcome: 'GRANTED',
          errorMessage: null,
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
          requestId: requestId ?? null,
        },
      })
    })

    return NextResponse.json({
      accessGranted: true,
      downloadUrls,
      expiresIn,
      hoursConsumed: hoursToDebit,
      currency: policy.currency ?? 'USD',
    })
  } catch (err: any) {
    console.error('[API] datasets/:datasetId/access error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
