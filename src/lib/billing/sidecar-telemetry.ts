/**
 * Sidecar Telemetry Integration
 * Handles telemetry from Xase Sidecar including storage tracking
 */

import { prisma } from '@/lib/prisma'
import { StorageService } from './storage-service'
import { MeteringService } from './metering-service'
import { BillingService } from './billing-service'

export interface SidecarTelemetry {
  sessionId: string
  leaseId: string
  tenantId: string
  datasetId: string
  
  // Processing metrics
  bytesProcessed: bigint
  recordsProcessed: number
  
  // Compute metrics
  startTime: Date
  endTime?: Date
  computeSeconds?: number
  
  // Storage metrics
  storageBytes: bigint
  peakStorageBytes?: bigint
  
  // Governance metrics
  policiesApplied: string[]
  watermarksApplied: number
  
  // Error tracking
  errors?: Array<{
    timestamp: Date
    error: string
    severity: 'warning' | 'error' | 'critical'
  }>
}

export interface ProcessedTelemetry {
  sessionId: string
  leaseId: string
  tenantId: string
  datasetId: string
  
  usage: {
    bytesProcessed: bigint
    computeHours: number
    storageGbHours: number
  }
  
  cost: {
    dataProcessing: number
    compute: number
    storage: number
    total: number
  }
  
  timestamp: Date
}

export class SidecarTelemetryService {
  /**
   * Process telemetry from sidecar
   */
  static async processTelemetry(telemetry: SidecarTelemetry): Promise<ProcessedTelemetry> {
    const {
      sessionId,
      leaseId,
      tenantId,
      datasetId,
      bytesProcessed,
      startTime,
      endTime,
      storageBytes,
      peakStorageBytes,
    } = telemetry

    // Calculate compute hours
    const computeSeconds = endTime 
      ? (endTime.getTime() - startTime.getTime()) / 1000
      : telemetry.computeSeconds || 0
    const computeHours = computeSeconds / 3600

    // Track storage snapshot at session start
    if (!endTime) {
      await StorageService.trackLeaseStorageStart(
        tenantId,
        leaseId,
        datasetId,
        storageBytes
      )
    }

    // Track storage snapshot at session end
    if (endTime) {
      await StorageService.trackLeaseStorageEnd(
        tenantId,
        leaseId,
        datasetId,
        peakStorageBytes || storageBytes,
        computeHours
      )
    }

    // Calculate storage GB-hours
    const storageGb = Number(storageBytes) / (1024 ** 3)
    const storageGbHours = storageGb * computeHours

    // Record metrics in metering service
    await MeteringService.recordUsage({
      tenantId,
      leaseId,
      datasetId,
      metric: 'bytes',
      value: Number(bytesProcessed),
      timestamp: new Date(),
      metadata: { sessionId },
    })

    await MeteringService.recordUsage({
      tenantId,
      leaseId,
      datasetId,
      metric: 'hours',
      value: computeHours,
      timestamp: new Date(),
      metadata: { sessionId },
    })

    await MeteringService.recordUsage({
      tenantId,
      leaseId,
      datasetId,
      metric: 'storage_gb_hours',
      value: storageGbHours,
      timestamp: new Date(),
      metadata: { sessionId, storageBytes: storageBytes.toString() },
    })

    // Calculate costs
    const cost = BillingService.calculateCost(
      bytesProcessed,
      computeHours,
      storageGbHours
    )

    const bytesGb = Number(bytesProcessed) / (1024 ** 3)
    const dataProcessingCost = bytesGb * 0.05
    const computeCost = computeHours * 0.10
    const storageCost = storageGbHours * 0.000032

    // Record usage in billing service if session ended
    if (endTime) {
      await BillingService.recordUsage(tenantId, {
        executionId: sessionId,
        bytesProcessed,
        computeHours,
        storageGbHours,
        cost,
      })

      // Update policy execution with storage metrics
      await this.updatePolicyExecution(leaseId, sessionId, {
        bytesProcessed,
        computeHours,
        storageGbHours,
        cost,
      })
    }

    return {
      sessionId,
      leaseId,
      tenantId,
      datasetId,
      usage: {
        bytesProcessed,
        computeHours,
        storageGbHours,
      },
      cost: {
        dataProcessing: dataProcessingCost,
        compute: computeCost,
        storage: storageCost,
        total: cost,
      },
      timestamp: new Date(),
    }
  }

  /**
   * Update policy execution with metrics
   */
  private static async updatePolicyExecution(
    leaseId: string,
    executionId: string,
    metrics: {
      bytesProcessed: bigint
      computeHours: number
      storageGbHours: number
      cost: number
    }
  ): Promise<void> {
    try {
      // Find the policy execution
      const execution = await prisma.policyExecution.findFirst({
        where: {
          leaseId,
          executionId,
        },
      })

      if (!execution) {
        console.warn(`[SidecarTelemetry] Policy execution not found: ${executionId}`)
        return
      }

      // Update with storage metrics
      await prisma.policyExecution.update({
        where: { id: execution.id },
        data: {
          bytesStreamed: metrics.bytesProcessed,
          hoursUsed: metrics.computeHours,
          totalCost: metrics.cost,
          completedAt: new Date(),
        },
      })

      // Update storage fields if they exist
      await prisma.$executeRaw`
        UPDATE xase_policy_executions
        SET 
          storage_gb_hours = ${metrics.storageGbHours},
          avg_storage_gb = ${metrics.storageGbHours / metrics.computeHours},
          peak_storage_gb = ${metrics.storageGbHours / metrics.computeHours}
        WHERE id = ${execution.id}
      `.catch(err => {
        console.warn('[SidecarTelemetry] Could not update storage fields (migration may not be applied):', err.message)
      })

    } catch (error) {
      console.error('[SidecarTelemetry] Failed to update policy execution:', error)
    }
  }

  /**
   * Process batch telemetry
   */
  static async processBatchTelemetry(
    telemetryBatch: SidecarTelemetry[]
  ): Promise<ProcessedTelemetry[]> {
    const results: ProcessedTelemetry[] = []

    for (const telemetry of telemetryBatch) {
      try {
        const processed = await this.processTelemetry(telemetry)
        results.push(processed)
      } catch (error) {
        console.error('[SidecarTelemetry] Failed to process telemetry:', error)
      }
    }

    return results
  }

  /**
   * Get telemetry summary for a lease
   */
  static async getLeaseTelemetrySummary(leaseId: string): Promise<{
    totalBytesProcessed: bigint
    totalComputeHours: number
    totalStorageGbHours: number
    totalCost: number
    sessionCount: number
    avgSessionDuration: number
  }> {
    const executions = await prisma.policyExecution.findMany({
      where: { leaseId },
    })

    const totalBytesProcessed = executions.reduce(
      (sum, e) => sum + BigInt(e.bytesStreamed || 0),
      BigInt(0)
    )

    const totalComputeHours = executions.reduce((sum, e) => sum + e.hoursUsed, 0)
    
    const totalCost = executions.reduce(
      (sum, e) => sum + Number(e.totalCost),
      0
    )

    const sessionCount = executions.length
    const avgSessionDuration = sessionCount > 0 ? totalComputeHours / sessionCount : 0

    // Calculate storage GB-hours from executions
    let totalStorageGbHours = 0
    try {
      const result = await prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(storage_gb_hours), 0) as total
        FROM xase_policy_executions
        WHERE lease_id = ${leaseId}
      `
      if (result && result[0]) {
        totalStorageGbHours = Number(result[0].total)
      }
    } catch (error) {
      console.warn('[SidecarTelemetry] Could not query storage_gb_hours:', error)
    }

    return {
      totalBytesProcessed,
      totalComputeHours,
      totalStorageGbHours,
      totalCost,
      sessionCount,
      avgSessionDuration,
    }
  }

  /**
   * Create periodic storage snapshots for active sessions
   */
  static async createPeriodicSnapshots(): Promise<number> {
    try {
      // Get active sidecar sessions
      const activeSessions = await prisma.sidecarSession.findMany({
        where: {
          status: 'ACTIVE',
        },
        include: {
          lease: {
            include: {
              dataset: {
                select: {
                  id: true,
                  totalSizeBytes: true,
                },
              },
            },
          },
        },
      })

      let snapshotCount = 0

      for (const session of activeSessions) {
        await StorageService.createSnapshot({
          tenantId: session.lease.clientTenantId,
          datasetId: session.lease.datasetId,
          leaseId: session.leaseId,
          storageBytes: session.lease.dataset.totalSizeBytes,
          snapshotType: 'PERIODIC',
          hoursInPeriod: 1.0,
        })
        snapshotCount++
      }

      console.log(`[SidecarTelemetry] Created ${snapshotCount} periodic snapshots`)
      return snapshotCount
    } catch (error) {
      console.error('[SidecarTelemetry] Failed to create periodic snapshots:', error)
      return 0
    }
  }
}
