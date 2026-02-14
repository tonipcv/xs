// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const { datasetId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })
    if (!user?.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: { id: true, tenantId: true }
    })
    if (!dataset || dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Load all sources for this dataset
    const sources = await prisma.dataSource.findMany({
      where: { datasetId: dataset.id },
      select: {
        id: true,
        cloudIntegrationId: true,
        storageLocation: true,
        addedAt: true,
        status: true,
      },
      orderBy: { addedAt: 'desc' },
    })

    // Group by (cloudIntegrationId, storageLocation)
    const byKey = new Map<string, Array<typeof sources[number]>>()
    for (const s of sources) {
      const key = `${s.cloudIntegrationId}::${s.storageLocation}`
      const arr = byKey.get(key) || []
      arr.push(s)
      byKey.set(key, arr)
    }

    const toRemove: string[] = []
    for (const [, arr] of byKey) {
      if (arr.length <= 1) continue
      // keep the first (newest), remove the rest
      const keep = arr[0]
      const removeRest = arr.slice(1)
      for (const r of removeRest) {
        toRemove.push(r.id)
      }
    }

    // Soft-remove duplicates and delete their segments
    if (toRemove.length > 0) {
      await prisma.audioSegment.deleteMany({ where: { dataSourceId: { in: toRemove } } })
      await prisma.dataSource.updateMany({ where: { id: { in: toRemove } }, data: { status: 'REMOVED' } })
    }

    // Recalculate aggregates
    // Use the same helper in sibling route by re-implementing minimal logic here
    const activeSources = await prisma.dataSource.findMany({
      where: { datasetId: dataset.id, status: 'ACTIVE' },
      select: { numRecordings: true, durationHours: true, sizeBytes: true, sampleRate: true, codec: true, language: true },
    })

    const totalRecordings = activeSources.reduce((a, s) => a + (s.numRecordings || 0), 0)
    const totalSize = activeSources.reduce((a, s) => a + Number(s.sizeBytes || 0n), 0)
    const totalHours = activeSources.reduce((a, s) => {
      const v = Number(s.durationHours || 0)
      const hours = v > 100 ? v / 3600 : v
      return a + hours
    }, 0)

    let primarySampleRate = 16000
    let primaryCodec = 'wav'
    let primaryLanguage = 'en-US'
    if (activeSources.length > 0) {
      const srFreq: Record<number, number> = {}
      const codecFreq: Record<string, number> = {}
      const langFreq: Record<string, number> = {}
      for (const s of activeSources) {
        if (s.sampleRate) srFreq[s.sampleRate] = (srFreq[s.sampleRate] || 0) + 1
        if (s.codec) codecFreq[s.codec] = (codecFreq[s.codec] || 0) + 1
        if (s.language) langFreq[s.language] = (langFreq[s.language] || 0) + 1
      }
      if (Object.keys(srFreq).length) primarySampleRate = parseInt(Object.keys(srFreq).reduce((a,b)=> srFreq[a as any] > srFreq[b as any] ? a : b))
      if (Object.keys(codecFreq).length) primaryCodec = Object.keys(codecFreq).reduce((a,b)=> codecFreq[a] > codecFreq[b] ? a : b)
      if (Object.keys(langFreq).length) primaryLanguage = Object.keys(langFreq).reduce((a,b)=> langFreq[a] > langFreq[b] ? a : b)
    }

    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        numRecordings: totalRecordings,
        totalDurationHours: totalHours,
        storageSize: BigInt(totalSize),
        totalSizeBytes: BigInt(totalSize),
        primarySampleRate,
        primaryCodec,
        primaryLanguage,
        language: primaryLanguage,
      }
    })

    return NextResponse.json({ removed: toRemove.length, keptGroups: byKey.size })
  } catch (e: any) {
    console.error('POST /datasets/[datasetId]/sources/cleanup error:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
