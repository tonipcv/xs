// @ts-nocheck
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { datasetId } = await params
    const body = await req.json()
    const name = (body?.name || '').trim()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const ds = await prisma.dataset.findFirst({ where: { datasetId, tenantId }, select: { id: true } })
    if (!ds) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    await prisma.dataset.update({ where: { id: ds.id }, data: { name } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('PATCH dataset name error:', error)
    return NextResponse.json({ error: 'Failed to update dataset' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { datasetId } = await params

    const ds = await prisma.dataset.findFirst({ where: { datasetId, tenantId }, select: { id: true } })
    if (!ds) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    await prisma.dataset.delete({ where: { id: ds.id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE dataset error:', error)
    return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 })
  }
}
