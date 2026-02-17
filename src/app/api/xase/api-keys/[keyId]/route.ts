import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const { keyId } = await params

    // Verify the key belongs to this tenant
    const existingKey = await prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    })

    if (!existingKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Soft delete by setting isActive to false
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error: any) {
    console.error('[API] DELETE /api/xase/api-keys/[keyId] error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
