import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId')
    const datasetFilter = datasetId ? { datasetId } : {}

    const datasets = await prisma.dataset.findMany({
      where: datasetFilter,
      select: {
        id: true,
        datasetId: true,
        name: true,
        status: true,
        processingStatus: true,
        totalDurationHours: true,
        numRecordings: true,
        totalSizeBytes: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (datasets.length === 0) {
      return NextResponse.json({ error: 'No datasets found', filter: datasetFilter }, { status: 404 })
    }

    const results = []
    let criticalCount = 0

    for (const ds of datasets) {
      const sources = await prisma.dataSource.findMany({
        where: { datasetId: ds.id },
        select: {
          id: true,
          name: true,
          numRecordings: true,
          durationHours: true,
          sizeBytes: true,
          addedAt: true,
        },
        orderBy: { addedAt: 'desc' },
      })

      const agg = sources.reduce(
        (acc, s) => {
          acc.sourcesCount += 1
          acc.numRecordings += Number(s.numRecordings || 0)
          acc.durationHours += Number(s.durationHours || 0)
          acc.sizeBytes += Number(s.sizeBytes || 0)
          return acc
        },
        { sourcesCount: 0, numRecordings: 0, durationHours: 0, sizeBytes: 0 }
      )

      const accessAgg = await prisma.accessLog.aggregate({
        where: { datasetId: ds.id },
        _sum: { hoursAccessed: true },
        _count: { _all: true },
      })

      const dsHours = Number(ds.totalDurationHours || 0)
      const dsRecs = Number(ds.numRecordings || 0)
      const dsSize = Number(ds.totalSizeBytes || 0)

      const hoursDelta = Math.abs(dsHours - agg.durationHours)
      const recsDelta = Math.abs(dsRecs - agg.numRecordings)
      const sizeDelta = Math.abs(dsSize - agg.sizeBytes)

      const hoursTol = 0.05
      const sizeTol = 5 * 1024 * 1024

      // Detect seconds stored in hours field
      const secondsLike = dsHours > 1000 && agg.durationHours < 50 && Math.abs(dsHours / 3600 - agg.durationHours) < 5

      const issues = []
      if (secondsLike) {
        issues.push({
          level: 'CRITICAL',
          msg: `totalDurationHours appears to be in seconds (dataset=${dsHours}, sources≈${agg.durationHours}). Divide by 3600.`,
        })
        criticalCount++
      }
      if (hoursDelta > hoursTol && !secondsLike) {
        issues.push({
          level: 'WARN',
          msg: `Duration mismatch: dataset=${dsHours.toFixed(2)}h vs sources=${agg.durationHours.toFixed(2)}h (Δ=${hoursDelta.toFixed(2)}h)`,
        })
      }
      if (recsDelta > 0) {
        issues.push({
          level: 'WARN',
          msg: `Recordings mismatch: dataset=${dsRecs} vs sources=${agg.numRecordings} (Δ=${recsDelta})`,
        })
      }
      if (sizeDelta > sizeTol) {
        issues.push({
          level: 'WARN',
          msg: `Size mismatch: dataset=${formatBytes(dsSize)} vs sources=${formatBytes(agg.sizeBytes)} (Δ≈${formatBytes(sizeDelta)})`,
        })
      }
      if (dsSize === 0 && agg.sizeBytes > 0) {
        issues.push({ level: 'INFO', msg: 'Dataset.totalSizeBytes is 0 but sources have size.' })
      }

      results.push({
        dataset: {
          id: ds.id,
          datasetId: ds.datasetId,
          name: ds.name,
          status: ds.status,
          processingStatus: ds.processingStatus,
        },
        aggregates: {
          totalDurationHours: dsHours,
          numRecordings: dsRecs,
          totalSizeBytes: dsSize,
        },
        sources: {
          count: agg.sourcesCount,
          durationHours: agg.durationHours,
          numRecordings: agg.numRecordings,
          sizeBytes: agg.sizeBytes,
        },
        accessLogs: {
          events: accessAgg._count?._all || 0,
          hoursAccessed: Number(accessAgg._sum?.hoursAccessed || 0),
        },
        issues,
        suggestions: secondsLike
          ? ['Normalize totalDurationHours by dividing by 3600']
          : recsDelta !== 0 || sizeDelta > sizeTol
          ? ['Sync aggregates from data sources']
          : [],
      })
    }

    return NextResponse.json({ datasets: results, criticalCount }, { status: 200 })
  } catch (err: any) {
    console.error('[API] audit-datasets error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error', details: err?.message }, { status: 500 })
  }
}

function formatBytes(n: number | bigint | null | undefined): string {
  const b = Number(n || 0)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
