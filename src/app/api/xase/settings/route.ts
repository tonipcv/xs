// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        organizationType: true,
        createdAt: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Return tenant settings (extend as needed)
    return NextResponse.json({
      tenantId: tenant.id,
      organizationName: tenant.name,
      organizationType: tenant.organizationType,
      createdAt: tenant.createdAt,
      // Placeholder for integrations and webhooks
      integrations: {
        s3BucketArn: null,
        databaseConnectionString: null,
      },
      webhooks: {
        policyCreated: null,
        consentRevoked: null,
        leaseIssued: null,
      },
    })
  } catch (error: any) {
    console.error('[API] GET /api/xase/settings error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await req.json()
    const { organizationName, organizationType, integrations, webhooks } = body

    // Update tenant basic info
    const updateData: any = {}
    if (organizationName) updateData.name = organizationName
    if (organizationType) updateData.organizationType = organizationType

    if (Object.keys(updateData).length > 0) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
      })
    }

    // TODO: Store integrations and webhooks in a separate table or JSON field
    // For now, we'll just acknowledge the save

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
      tenantId,
    })
  } catch (error: any) {
    console.error('[API] PUT /api/xase/settings error:', error)
    return NextResponse.json({ error: error.message || 'Failed to save settings' }, { status: 500 })
  }
}
