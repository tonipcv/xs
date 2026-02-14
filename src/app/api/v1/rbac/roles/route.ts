/**
 * API endpoint for RBAC role management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RBACService } from '@/lib/security/rbac-service'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    const action = url.searchParams.get('action')

    if (action === 'list-users' && tenantId) {
      const users = await RBACService.listUsersWithRoles(tenantId)
      return NextResponse.json({ users, count: users.length })
    }

    const roles = await RBACService.getAllRoles(tenantId || undefined)
    return NextResponse.json({ roles, count: roles.length })
  } catch (error: any) {
    console.error('[API] GET /api/v1/rbac/roles error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, userId, roleId, tenantId } = body

    if (action === 'assign') {
      const userRole = await RBACService.assignRole(
        userId,
        roleId,
        tenantId,
        session.user.email || 'system'
      )
      return NextResponse.json(userRole)
    }

    if (action === 'revoke') {
      await RBACService.revokeRole(
        userId,
        roleId,
        tenantId,
        session.user.email || 'system'
      )
      return NextResponse.json({ success: true })
    }

    if (action === 'create-custom') {
      const role = await RBACService.createCustomRole(
        tenantId,
        body.name,
        body.description,
        body.permissions
      )
      return NextResponse.json(role, { status: 201 })
    }

    if (action === 'check-permission') {
      const hasPermission = await RBACService.hasPermission(
        userId,
        tenantId,
        body.permission
      )
      return NextResponse.json({ hasPermission })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/rbac/roles error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
