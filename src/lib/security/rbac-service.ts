/**
 * RBAC Service - Role-Based Access Control
 * Manages roles, permissions, and access control
 */

import { prisma } from '@/lib/prisma'

export type Permission = 
  | 'datasets:read'
  | 'datasets:write'
  | 'datasets:delete'
  | 'policies:read'
  | 'policies:write'
  | 'policies:delete'
  | 'leases:read'
  | 'leases:write'
  | 'leases:revoke'
  | 'api-keys:read'
  | 'api-keys:write'
  | 'api-keys:delete'
  | 'settings:read'
  | 'settings:write'
  | 'billing:read'
  | 'billing:write'
  | 'users:read'
  | 'users:write'
  | 'admin:all'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  isSystem: boolean
  tenantId?: string
}

export interface UserRole {
  userId: string
  roleId: string
  tenantId: string
  assignedAt: Date
  assignedBy: string
}

export interface AccessScope {
  resource: 'dataset' | 'policy' | 'lease' | 'api-key'
  resourceId: string
  permissions: Permission[]
}

export class RBACService {
  /**
   * System roles
   */
  static readonly SYSTEM_ROLES: Role[] = [
    {
      id: 'role_owner',
      name: 'Owner',
      description: 'Full access to all resources',
      permissions: ['admin:all'],
      isSystem: true,
    },
    {
      id: 'role_admin',
      name: 'Admin',
      description: 'Administrative access',
      permissions: [
        'datasets:read', 'datasets:write', 'datasets:delete',
        'policies:read', 'policies:write', 'policies:delete',
        'leases:read', 'leases:write', 'leases:revoke',
        'api-keys:read', 'api-keys:write', 'api-keys:delete',
        'settings:read', 'settings:write',
        'billing:read', 'billing:write',
        'users:read', 'users:write',
      ],
      isSystem: true,
    },
    {
      id: 'role_developer',
      name: 'Developer',
      description: 'Development access',
      permissions: [
        'datasets:read', 'datasets:write',
        'policies:read', 'policies:write',
        'leases:read', 'leases:write',
        'api-keys:read', 'api-keys:write',
      ],
      isSystem: true,
    },
    {
      id: 'role_viewer',
      name: 'Viewer',
      description: 'Read-only access',
      permissions: [
        'datasets:read',
        'policies:read',
        'leases:read',
        'billing:read',
      ],
      isSystem: true,
    },
    {
      id: 'role_billing',
      name: 'Billing Manager',
      description: 'Billing and usage access',
      permissions: [
        'billing:read',
        'billing:write',
        'datasets:read',
        'leases:read',
      ],
      isSystem: true,
    },
  ]

  /**
   * Check if user has permission
   */
  static async hasPermission(
    userId: string,
    tenantId: string,
    permission: Permission
  ): Promise<boolean> {
    const roles = await this.getUserRoles(userId, tenantId)
    
    for (const role of roles) {
      if (role.permissions.includes('admin:all')) {
        return true
      }
      if (role.permissions.includes(permission)) {
        return true
      }
    }

    return false
  }

  /**
   * Check if user has any of the permissions
   */
  static async hasAnyPermission(
    userId: string,
    tenantId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, tenantId, permission)) {
        return true
      }
    }
    return false
  }

  /**
   * Check if user has all permissions
   */
  static async hasAllPermissions(
    userId: string,
    tenantId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, tenantId, permission))) {
        return false
      }
    }
    return true
  }

  /**
   * Get user roles
   */
  static async getUserRoles(userId: string, tenantId: string): Promise<Role[]> {
    // Check if user is owner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true, xaseRole: true },
    })

    if (user?.tenantId === tenantId && user.xaseRole === 'OWNER') {
      return [this.SYSTEM_ROLES[0]] // Owner role
    }

    if (user?.tenantId === tenantId && user.xaseRole === 'ADMIN') {
      return [this.SYSTEM_ROLES[1]] // Admin role
    }

    if (user?.tenantId === tenantId && user.xaseRole === 'VIEWER') {
      return [this.SYSTEM_ROLES[3]] // Viewer role
    }

    // Default to viewer for tenant members
    if (user?.tenantId === tenantId) {
      return [this.SYSTEM_ROLES[3]]
    }

    return []
  }

  /**
   * Assign role to user
   */
  static async assignRole(
    userId: string,
    roleId: string,
    tenantId: string,
    assignedBy: string
  ): Promise<UserRole> {
    const role = this.SYSTEM_ROLES.find(r => r.id === roleId)
    if (!role) {
      throw new Error('Role not found')
    }

    // Update user role in database
    const xaseRole = roleId === 'role_owner' ? 'OWNER' : 
                     roleId === 'role_admin' ? 'ADMIN' : 'VIEWER'

    await prisma.user.update({
      where: { id: userId },
      data: { xaseRole },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: assignedBy,
        action: 'ROLE_ASSIGNED',
        resourceType: 'user',
        resourceId: userId,
        metadata: JSON.stringify({ roleId, roleName: role.name }),
        status: 'SUCCESS',
      },
    })

    return {
      userId,
      roleId,
      tenantId,
      assignedAt: new Date(),
      assignedBy,
    }
  }

  /**
   * Revoke role from user
   */
  static async revokeRole(
    userId: string,
    roleId: string,
    tenantId: string,
    revokedBy: string
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { xaseRole: 'VIEWER' },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: revokedBy,
        action: 'ROLE_REVOKED',
        resourceType: 'user',
        resourceId: userId,
        metadata: JSON.stringify({ roleId }),
        status: 'SUCCESS',
      },
    })
  }

  /**
   * Create custom role
   */
  static async createCustomRole(
    tenantId: string,
    name: string,
    description: string,
    permissions: Permission[]
  ): Promise<Role> {
    const role: Role = {
      id: `role_custom_${Date.now()}`,
      name,
      description,
      permissions,
      isSystem: false,
      tenantId,
    }

    // Store in database (simplified)
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'ROLE_CREATED',
        resourceType: 'role',
        resourceId: role.id,
        metadata: JSON.stringify(role),
        status: 'SUCCESS',
      },
    })

    return role
  }

  /**
   * Check resource access with scope
   */
  static async checkResourceAccess(
    userId: string,
    tenantId: string,
    resource: 'dataset' | 'policy' | 'lease' | 'api-key',
    resourceId: string,
    permission: Permission
  ): Promise<boolean> {
    // Check if user has global permission
    if (await this.hasPermission(userId, tenantId, permission)) {
      return true
    }

    // Check resource-specific scope
    const scope = await this.getResourceScope(userId, resource, resourceId)
    if (scope && scope.permissions.includes(permission)) {
      return true
    }

    return false
  }

  /**
   * Get resource scope
   */
  static async getResourceScope(
    userId: string,
    resource: 'dataset' | 'policy' | 'lease' | 'api-key',
    resourceId: string
  ): Promise<AccessScope | null> {
    // In production, fetch from database
    // For now, return null
    return null
  }

  /**
   * Grant resource access
   */
  static async grantResourceAccess(
    userId: string,
    tenantId: string,
    resource: 'dataset' | 'policy' | 'lease' | 'api-key',
    resourceId: string,
    permissions: Permission[]
  ): Promise<AccessScope> {
    const scope: AccessScope = {
      resource,
      resourceId,
      permissions,
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'RESOURCE_ACCESS_GRANTED',
        resourceType: resource,
        resourceId,
        metadata: JSON.stringify({ permissions }),
        status: 'SUCCESS',
      },
    })

    return scope
  }

  /**
   * Revoke resource access
   */
  static async revokeResourceAccess(
    userId: string,
    tenantId: string,
    resource: 'dataset' | 'policy' | 'lease' | 'api-key',
    resourceId: string
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'RESOURCE_ACCESS_REVOKED',
        resourceType: resource,
        resourceId,
        status: 'SUCCESS',
      },
    })
  }

  /**
   * Get all roles
   */
  static async getAllRoles(tenantId?: string): Promise<Role[]> {
    const roles = [...this.SYSTEM_ROLES]

    // Add custom roles for tenant
    if (tenantId) {
      // In production, fetch custom roles from database
    }

    return roles
  }

  /**
   * Get role by ID
   */
  static getRole(roleId: string): Role | null {
    return this.SYSTEM_ROLES.find(r => r.id === roleId) || null
  }

  /**
   * List users with roles
   */
  static async listUsersWithRoles(tenantId: string): Promise<Array<{
    userId: string
    email: string
    name: string | null
    roles: Role[]
  }>> {
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        xaseRole: true,
      },
    })

    return users.map(user => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.xaseRole === 'OWNER' ? [this.SYSTEM_ROLES[0]] :
             user.xaseRole === 'ADMIN' ? [this.SYSTEM_ROLES[1]] :
             [this.SYSTEM_ROLES[3]],
    }))
  }
}
