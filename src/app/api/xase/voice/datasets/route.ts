// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'node:crypto'
import { getTenantId } from '@/lib/xase/server-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
    }

    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: {
        id: true,
        datasetId: true,
        name: true,
        language: true,
        status: true,
        totalDurationHours: true,
        numRecordings: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ datasets })
  } catch (e: any) {
    console.error('List datasets error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { name, description, language } = body as {
      name: string
      description?: string
      language: string
    }

    if (!name || !language) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const datasetId = 'ds_' + crypto.randomBytes(12).toString('hex')
    const storageLocation = `datasets/${datasetId}/`

    const ds = await prisma.dataset.create({
      data: {
        tenantId,
        datasetId,
        name,
        description: description || null,
        language,
        storageLocation,
        totalDurationHours: 0,
        numRecordings: 0,
        processingStatus: 'PENDING',
        status: 'DRAFT',
      },
      select: { id: true, datasetId: true },
    })

    return NextResponse.json({ ok: true, datasetId: ds.datasetId }, { status: 201 })
  } catch (e: any) {
    console.error('Create dataset error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
