'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Users, Key, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export default function RBACPage() {
  const [roles, setRoles] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedRole, setSelectedRole] = useState<any>(null)
  
  const [assignModal, setAssignModal] = useState(false)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignRoleId, setAssignRoleId] = useState('')

  const [customRoleModal, setCustomRoleModal] = useState(false)
  const [customRole, setCustomRole] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  })

  const allPermissions = [
    'datasets:read', 'datasets:write', 'datasets:delete',
    'policies:read', 'policies:write', 'policies:delete',
    'leases:read', 'leases:write', 'leases:revoke',
    'api-keys:read', 'api-keys:write', 'api-keys:delete',
    'settings:read', 'settings:write',
    'billing:read', 'billing:write',
    'users:read', 'users:write',
    'admin:all',
  ]

  useEffect(() => {
    loadRoles()
    loadUsers()
  }, [])

  const loadRoles = async () => {
    try {
      const response = await fetch('/api/v1/rbac/roles?tenantId=current')
      const data = await response.json()
      setRoles(data.roles || [])
    } catch (error) {
      console.error('Failed to load roles:', error)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/v1/rbac/roles?action=list-users&tenantId=current')
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const assignRole = async () => {
    try {
      await fetch('/api/v1/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          userId: assignUserId,
          roleId: assignRoleId,
          tenantId: 'current',
        }),
      })
      setAssignModal(false)
      setAssignUserId('')
      setAssignRoleId('')
      loadUsers()
    } catch (error) {
      console.error('Failed to assign role:', error)
    }
  }

  const revokeRole = async (userId: string, roleId: string) => {
    try {
      await fetch('/api/v1/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke',
          userId,
          roleId,
          tenantId: 'current',
        }),
      })
      loadUsers()
    } catch (error) {
      console.error('Failed to revoke role:', error)
    }
  }

  const createCustomRole = async () => {
    try {
      await fetch('/api/v1/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-custom',
          tenantId: 'current',
          ...customRole,
        }),
      })
      setCustomRoleModal(false)
      setCustomRole({ name: '', description: '', permissions: [] })
      loadRoles()
    } catch (error) {
      console.error('Failed to create custom role:', error)
    }
  }

  const togglePermission = (permission: string) => {
    setCustomRole(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }))
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roles & Permissions (RBAC)</h1>
          <p className="text-muted-foreground mt-2">
            Manage role-based access control
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={customRoleModal} onOpenChange={setCustomRoleModal}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Custom Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Custom Role</DialogTitle>
                <DialogDescription>
                  Define a custom role with specific permissions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Role Name</Label>
                  <Input
                    placeholder="e.g., Data Analyst"
                    value={customRole.name}
                    onChange={(e) => setCustomRole({ ...customRole, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe the role..."
                    value={customRole.description}
                    onChange={(e) => setCustomRole({ ...customRole, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border rounded">
                    {allPermissions.map((permission) => (
                      <div
                        key={permission}
                        className={`p-2 border rounded cursor-pointer hover:bg-accent ${
                          customRole.permissions.includes(permission) ? 'bg-primary/10 border-primary' : ''
                        }`}
                        onClick={() => togglePermission(permission)}
                      >
                        <span className="text-sm">{permission}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={createCustomRole} className="w-full">
                  Create Role
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={assignModal} onOpenChange={setAssignModal}>
            <DialogTrigger asChild>
              <Button>
                <Users className="mr-2 h-4 w-4" />
                Assign Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Role to User</DialogTitle>
                <DialogDescription>
                  Select a user and role to assign
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>User ID</Label>
                  <Input
                    placeholder="user_..."
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={assignRoleId} onValueChange={setAssignRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={assignRole} className="w-full">
                  Assign Role
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System Roles</CardTitle>
            <CardDescription>
              Pre-defined roles with standard permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roles.filter(r => r.isSystem).map((role) => (
                <div
                  key={role.id}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-accent ${
                    selectedRole?.id === role.id ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="font-medium">{role.name}</span>
                    </div>
                    <Badge variant="outline">System</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {role.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {role.permissions.slice(0, 3).map((perm: string) => (
                      <Badge key={perm} variant="secondary" className="text-xs">
                        {perm}
                      </Badge>
                    ))}
                    {role.permissions.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{role.permissions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom Roles</CardTitle>
            <CardDescription>
              Tenant-specific custom roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {roles.filter(r => !r.isSystem).length > 0 ? (
              <div className="space-y-3">
                {roles.filter(r => !r.isSystem).map((role) => (
                  <div
                    key={role.id}
                    className={`p-4 border rounded-lg cursor-pointer hover:bg-accent ${
                      selectedRole?.id === role.id ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => setSelectedRole(role)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key className="h-5 w-5 text-primary" />
                        <span className="font-medium">{role.name}</span>
                      </div>
                      <Badge>Custom</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {role.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {role.permissions.slice(0, 3).map((perm: string) => (
                        <Badge key={perm} variant="secondary" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                      {role.permissions.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{role.permissions.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No custom roles yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRole && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedRole.name} - Permissions</CardTitle>
            <CardDescription>
              All permissions granted by this role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {selectedRole.permissions.map((permission: string) => (
                <div key={permission} className="p-3 border rounded-lg">
                  <span className="text-sm">{permission}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users & Roles</CardTitle>
          <CardDescription>
            Current role assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{user.email}</p>
                    {user.name && (
                      <p className="text-sm text-muted-foreground">{user.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {user.roles.map((role: any) => (
                      <Badge key={role.id} variant="default">
                        {role.name}
                      </Badge>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeRole(user.userId, user.roles[0]?.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No users yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
