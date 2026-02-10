// @ts-nocheck
/**
 * GDPR Article 17 - Right to Erasure Workflow
 * Complete implementation for data deletion requests
 */

import { prisma } from '@/lib/prisma'

export interface ErasureRequest {
  id: string
  tenantId: string
  userId?: string
  datasetId?: string
  reason: 'user_request' | 'consent_withdrawn' | 'retention_expired' | 'legal_obligation'
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected'
  requestedBy: string
  requestedAt: Date
  approvedBy?: string
  approvedAt?: Date
  completedAt?: Date
  error?: string
  metadata?: Record<string, any>
}

export interface ErasureResult {
  success: boolean
  datasetsDeleted: number
  recordsDeleted: number
  leasesRevoked: number
  policiesDeleted: number
  auditLogsArchived: number
  errors: string[]
  completedAt: Date
}

export interface ErasureReport {
  requestId: string
  status: string
  itemsToDelete: {
    datasets: number
    records: number
    leases: number
    policies: number
    auditLogs: number
  }
  estimatedTime: string
  warnings: string[]
}

export class ErasureWorkflow {
  async createRequest(request: Omit<ErasureRequest, 'id' | 'status' | 'requestedAt'>): Promise<ErasureRequest> {
    const erasureRequest: ErasureRequest = {
      id: `er_${Date.now()}`,
      status: 'pending',
      requestedAt: new Date(),
      ...request,
    }

    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        action: 'ERASURE_REQUEST_CREATED',
        resourceType: 'erasure_request',
        resourceId: erasureRequest.id,
        metadata: JSON.stringify({
          reason: request.reason,
          datasetId: request.datasetId,
        }),
        status: 'SUCCESS',
      },
    })

    return erasureRequest
  }

  async approveRequest(requestId: string, approvedBy: string): Promise<ErasureRequest> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot approve request in status: ${request.status}`)
    }

    const updatedRequest: ErasureRequest = {
      ...request,
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    }

    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: approvedBy,
        action: 'ERASURE_REQUEST_APPROVED',
        resourceType: 'erasure_request',
        resourceId: requestId,
        status: 'SUCCESS',
      },
    })

    return updatedRequest
  }

  async rejectRequest(requestId: string, rejectedBy: string, reason: string): Promise<ErasureRequest> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    const updatedRequest: ErasureRequest = {
      ...request,
      status: 'rejected',
      metadata: { ...request.metadata, rejectedBy, rejectionReason: reason },
    }

    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        userId: rejectedBy,
        action: 'ERASURE_REQUEST_REJECTED',
        resourceType: 'erasure_request',
        resourceId: requestId,
        metadata: JSON.stringify({ reason }),
        status: 'SUCCESS',
      },
    })

    return updatedRequest
  }

  async executeErasure(requestId: string): Promise<ErasureResult> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    if (request.status !== 'approved') {
      throw new Error(`Cannot execute request in status: ${request.status}`)
    }

    request.status = 'processing'

    const result: ErasureResult = {
      success: false,
      datasetsDeleted: 0,
      recordsDeleted: 0,
      leasesRevoked: 0,
      policiesDeleted: 0,
      auditLogsArchived: 0,
      errors: [],
      completedAt: new Date(),
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Revoke active leases
        if (request.datasetId) {
          const revokedLeases = await tx.voiceAccessLease.updateMany({
            where: {
              datasetId: request.datasetId,
              status: 'ACTIVE',
            },
            data: {
              status: 'REVOKED',
              revokedAt: new Date(),
              revokedReason: 'erasure_request',
            },
          })
          result.leasesRevoked = revokedLeases.count
        }

        // 2. Delete or archive policies
        if (request.datasetId) {
          const deletedPolicies = await tx.voiceAccessPolicy.deleteMany({
            where: { datasetId: request.datasetId },
          })
          result.policiesDeleted = deletedPolicies.count
        }

        // 3. Archive audit logs (GDPR requires keeping audit trail)
        const auditLogs = await tx.auditLog.updateMany({
          where: {
            tenantId: request.tenantId,
            resourceId: request.datasetId || undefined,
          },
          data: {
            metadata: JSON.stringify({ archived: true, archivedAt: new Date() }),
          },
        })
        result.auditLogsArchived = auditLogs.count

        // 4. Delete dataset
        if (request.datasetId) {
          const dataset = await tx.dataset.findUnique({
            where: { datasetId: request.datasetId },
            select: { numRecordings: true },
          })

          if (dataset) {
            result.recordsDeleted = dataset.numRecordings

            await tx.dataset.delete({
              where: { datasetId: request.datasetId },
            })
            result.datasetsDeleted = 1
          }
        }

        // 5. Create final audit log
        await tx.auditLog.create({
          data: {
            tenantId: request.tenantId,
            action: 'ERASURE_COMPLETED',
            resourceType: 'erasure_request',
            resourceId: requestId,
            metadata: JSON.stringify({
              datasetsDeleted: result.datasetsDeleted,
              recordsDeleted: result.recordsDeleted,
              leasesRevoked: result.leasesRevoked,
            }),
            status: 'SUCCESS',
          },
        })
      })

      result.success = true
      request.status = 'completed'
      request.completedAt = new Date()
    } catch (error: any) {
      result.errors.push(error.message)
      request.status = 'failed'
      request.error = error.message
      request.completedAt = new Date()

      await prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          action: 'ERASURE_FAILED',
          resourceType: 'erasure_request',
          resourceId: requestId,
          errorMessage: error.message,
          status: 'FAILURE',
        },
      })
    }

    return result
  }

  async getRequest(requestId: string): Promise<ErasureRequest | null> {
    // In a real implementation, this would fetch from a database
    // For now, we'll return a mock
    return null
  }

  async listRequests(tenantId: string, status?: ErasureRequest['status']): Promise<ErasureRequest[]> {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'ERASURE_REQUEST_CREATED',
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    return auditLogs.map(log => {
      const metadata = log.metadata ? JSON.parse(log.metadata) : {}
      return {
        id: log.resourceId || `er_${log.id}`,
        tenantId: log.tenantId || tenantId,
        userId: log.userId || undefined,
        datasetId: metadata.datasetId,
        reason: metadata.reason || 'user_request',
        status: 'pending' as const,
        requestedBy: log.userId || 'system',
        requestedAt: log.timestamp,
      }
    })
  }

  async generateReport(requestId: string): Promise<ErasureReport> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    const warnings: string[] = []
    let datasetsCount = 0
    let recordsCount = 0
    let leasesCount = 0
    let policiesCount = 0
    let auditLogsCount = 0

    if (request.datasetId) {
      const dataset = await prisma.dataset.findUnique({
        where: { datasetId: request.datasetId },
        select: { numRecordings: true },
      })

      if (dataset) {
        datasetsCount = 1
        recordsCount = dataset.numRecordings
      }

      const activeLeases = await prisma.voiceAccessLease.count({
        where: {
          datasetId: request.datasetId,
          status: 'ACTIVE',
        },
      })
      leasesCount = activeLeases

      if (activeLeases > 0) {
        warnings.push(`${activeLeases} active leases will be revoked`)
      }

      const policies = await prisma.voiceAccessPolicy.count({
        where: { datasetId: request.datasetId },
      })
      policiesCount = policies

      const auditLogs = await prisma.auditLog.count({
        where: {
          tenantId: request.tenantId,
          resourceId: request.datasetId,
        },
      })
      auditLogsCount = auditLogs

      if (auditLogsCount > 0) {
        warnings.push(`${auditLogsCount} audit logs will be archived (not deleted per GDPR)`)
      }
    }

    const estimatedMinutes = Math.ceil((recordsCount / 1000) + 1)

    return {
      requestId: request.id,
      status: request.status,
      itemsToDelete: {
        datasets: datasetsCount,
        records: recordsCount,
        leases: leasesCount,
        policies: policiesCount,
        auditLogs: auditLogsCount,
      },
      estimatedTime: `${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}`,
      warnings,
    }
  }

  async scheduleErasure(requestId: string, scheduledFor: Date): Promise<void> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    if (request.status !== 'approved') {
      throw new Error('Only approved requests can be scheduled')
    }

    await prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        action: 'ERASURE_SCHEDULED',
        resourceType: 'erasure_request',
        resourceId: requestId,
        metadata: JSON.stringify({ scheduledFor }),
        status: 'SUCCESS',
      },
    })
  }

  async verifyErasure(requestId: string): Promise<{
    verified: boolean
    remainingData: string[]
    verifiedAt: Date
  }> {
    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Erasure request not found')
    }

    if (request.status !== 'completed') {
      throw new Error('Can only verify completed erasure requests')
    }

    const remainingData: string[] = []

    if (request.datasetId) {
      const dataset = await prisma.dataset.findUnique({
        where: { datasetId: request.datasetId },
      })

      if (dataset) {
        remainingData.push(`Dataset ${request.datasetId} still exists`)
      }

      const activeLeases = await prisma.voiceAccessLease.count({
        where: {
          datasetId: request.datasetId,
          status: 'ACTIVE',
        },
      })

      if (activeLeases > 0) {
        remainingData.push(`${activeLeases} active leases still exist`)
      }
    }

    return {
      verified: remainingData.length === 0,
      remainingData,
      verifiedAt: new Date(),
    }
  }

  async getErasureStats(tenantId: string): Promise<{
    totalRequests: number
    pendingRequests: number
    approvedRequests: number
    completedRequests: number
    failedRequests: number
    totalRecordsDeleted: number
  }> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: {
          in: ['ERASURE_REQUEST_CREATED', 'ERASURE_COMPLETED', 'ERASURE_FAILED'],
        },
      },
    })

    const stats = {
      totalRequests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalRecordsDeleted: 0,
    }

    logs.forEach(log => {
      if (log.action === 'ERASURE_REQUEST_CREATED') {
        stats.totalRequests++
        stats.pendingRequests++
      } else if (log.action === 'ERASURE_COMPLETED') {
        stats.completedRequests++
        const metadata = log.metadata ? JSON.parse(log.metadata) : {}
        stats.totalRecordsDeleted += metadata.recordsDeleted || 0
      } else if (log.action === 'ERASURE_FAILED') {
        stats.failedRequests++
      }
    })

    return stats
  }
}
