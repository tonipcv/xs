// @ts-nocheck
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get integration
    const integration = await prisma.cloudIntegration.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        accountName: true,
        projectId: true,
        subscriptionId: true,
        region: true,
        scopes: true,
        lastTestedAt: true,
        lastTestStatus: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
      }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Verify user has access to this tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (user?.tenantId !== integration.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(integration)
  } catch (error: any) {
    console.error('Get integration error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get integration' },
      { status: 500 }
    )
  }
}
