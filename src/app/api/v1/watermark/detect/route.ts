import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { detectWatermark } from '@/lib/xase/watermark-detector'

const BodySchema = z.object({
  audioHash: z.string().min(1),
  audioUrl: z.string().url().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { audioHash, audioUrl } = parsed.data

    // Fetch candidate policy IDs for this tenant (as contract proxies)
    const policies = await prisma.accessPolicy.findMany({
      where: { clientTenantId: auth.tenantId },
      select: { id: true },
      take: 100,
    })

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl required for detection' }, { status: 400 })
    }

    // Download audio
    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      return NextResponse.json({ error: 'Failed to download audio' }, { status: 400 })
    }
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

    // Call real watermark detection
    const candidateIds = policies.map(p => p.id);
    const detectionResult = await detectWatermark(audioBuffer, candidateIds);
    
    const detected = detectionResult.detected;
    const contractId = detectionResult.contractId;
    const confidence = detectionResult.confidence;

    // Log detection attempt
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId!,
        action: 'WATERMARK_DETECT',
        resourceType: 'AUDIO',
        resourceId: audioHash,
        status: detected ? 'SUCCESS' : 'NOT_FOUND',
        timestamp: new Date(),
        metadata: JSON.stringify({
          audioUrl,
          candidatesChecked: policies.length,
          confidence,
        }),
      },
    })

    return NextResponse.json({
      detected,
      contractId,
      confidence,
      method: 'pn_correlation_v1',
      audioHash,
      candidatesChecked: policies.length,
      audioSizeBytes: audioBuffer.length,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/watermark/detect error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
