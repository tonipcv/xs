// @ts-nocheck
/**
 * Data Retention and TTL Manager
 * Manages data lifecycle, retention policies, and automatic cleanup
 */

import { prisma } from '@/lib/prisma'

export interface RetentionPolicy {
  id: string
  datasetId: string
  tenantId: string
  retentionDays: number
  autoDelete: boolean
  archiveBeforeDelete: boolean
  notifyBeforeDelete: boolean
  notifyDaysBefore: number
  createdAt: Date
  updatedAt: Date
}

export interface RetentionJob {
  id: string
  policyId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  recordsProcessed: number
  recordsDeleted: number
  recordsArchived: number
  startedAt?: Date
  completedAt?: Date
  error?: string
}

export interface RetentionReport {
  datasetId: string
  totalRecords: number
  expiredRecords: number
  daysUntilExpiration: number
  estimatedDeletionDate: Date
  retentionPolicy: RetentionPolicy
}

export class RetentionManager {
  async createPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy> {
    const dataset = await prisma.dataset.findUnique({
      where: { datasetId: policy.datasetId },
    })

    if (!dataset) {
      throw new Error('Dataset not found')
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + policy.retentionDays)

    await prisma.dataset.update({
      where: { datasetId: policy.datasetId },
      data: { retentionExpiresAt: expiresAt },
    })

    return {
      id: `rp_${Date.now()}`,
      ...policy,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  async getPolicy(datasetId: string): Promise<RetentionPolicy | null> {
    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: {
        datasetId: true,
        tenantId: true,
        retentionExpiresAt: true,
      },
    })

    if (!dataset || !dataset.retentionExpiresAt) {
      return null
    }

    const now = new Date()
    const retentionDays = Math.ceil(
      (dataset.retentionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      id: `rp_${datasetId}`,
      datasetId: dataset.datasetId,
      tenantId: dataset.tenantId,
      retentionDays: Math.max(0, retentionDays),
      autoDelete: true,
      archiveBeforeDelete: false,
      notifyBeforeDelete: true,
      notifyDaysBefore: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  async updatePolicy(datasetId: string, updates: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
    const policy = await this.getPolicy(datasetId)
    if (!policy) {
      throw new Error('Retention policy not found')
    }

    if (updates.retentionDays !== undefined) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + updates.retentionDays)

      await prisma.dataset.update({
        where: { datasetId },
        data: { retentionExpiresAt: expiresAt },
      })
    }

    return {
      ...policy,
      ...updates,
      updatedAt: new Date(),
    }
  }

  async deletePolicy(datasetId: string): Promise<void> {
    await prisma.dataset.update({
      where: { datasetId },
      data: { retentionExpiresAt: null },
    })
  }

  async getExpiredDatasets(): Promise<string[]> {
    const now = new Date()
    const datasets = await prisma.dataset.findMany({
      where: {
        retentionExpiresAt: {
          lte: now,
        },
        status: {
          not: 'ARCHIVED',
        },
      },
      select: { datasetId: true },
    })

    return datasets.map(d => d.datasetId)
  }

  async getExpiringDatasets(daysAhead: number = 7): Promise<RetentionReport[]> {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + daysAhead)

    const datasets = await prisma.dataset.findMany({
      where: {
        retentionExpiresAt: {
          lte: futureDate,
          gte: new Date(),
        },
        status: {
          not: 'ARCHIVED',
        },
      },
      select: {
        datasetId: true,
        tenantId: true,
        numRecordings: true,
        retentionExpiresAt: true,
      },
    })

    const reports: RetentionReport[] = []

    for (const dataset of datasets) {
      if (!dataset.retentionExpiresAt) continue

      const policy = await this.getPolicy(dataset.datasetId)
      if (!policy) continue

      const daysUntilExpiration = Math.ceil(
        (dataset.retentionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )

      reports.push({
        datasetId: dataset.datasetId,
        totalRecords: dataset.numRecordings,
        expiredRecords: 0,
        daysUntilExpiration,
        estimatedDeletionDate: dataset.retentionExpiresAt,
        retentionPolicy: policy,
      })
    }

    return reports
  }

  async executeRetentionJob(datasetId: string): Promise<RetentionJob> {
    const job: RetentionJob = {
      id: `rj_${Date.now()}`,
      policyId: `rp_${datasetId}`,
      status: 'running',
      recordsProcessed: 0,
      recordsDeleted: 0,
      recordsArchived: 0,
      startedAt: new Date(),
    }

    try {
      const policy = await this.getPolicy(datasetId)
      if (!policy) {
        throw new Error('Retention policy not found')
      }

      const dataset = await prisma.dataset.findUnique({
        where: { datasetId },
      })

      if (!dataset) {
        throw new Error('Dataset not found')
      }

      job.recordsProcessed = dataset.numRecordings

      if (policy.archiveBeforeDelete) {
        await prisma.dataset.update({
          where: { datasetId },
          data: { status: 'ARCHIVED' },
        })
        job.recordsArchived = dataset.numRecordings
      }

      if (policy.autoDelete) {
        await prisma.dataset.delete({
          where: { datasetId },
        })
        job.recordsDeleted = dataset.numRecordings
      }

      job.status = 'completed'
      job.completedAt = new Date()

      await prisma.auditLog.create({
        data: {
          tenantId: dataset.tenantId,
          action: 'RETENTION_JOB_COMPLETED',
          resourceType: 'dataset',
          resourceId: datasetId,
          metadata: JSON.stringify({
            recordsDeleted: job.recordsDeleted,
            recordsArchived: job.recordsArchived,
          }),
          status: 'SUCCESS',
        },
      })
    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message
      job.completedAt = new Date()
    }

    return job
  }

  async runRetentionJobs(): Promise<RetentionJob[]> {
    const expiredDatasets = await this.getExpiredDatasets()
    const jobs: RetentionJob[] = []

    for (const datasetId of expiredDatasets) {
      const job = await this.executeRetentionJob(datasetId)
      jobs.push(job)
    }

    return jobs
  }

  async scheduleRetentionCheck(): Promise<void> {
    const expiringDatasets = await this.getExpiringDatasets(7)

    for (const report of expiringDatasets) {
      if (report.retentionPolicy.notifyBeforeDelete && report.daysUntilExpiration <= report.retentionPolicy.notifyDaysBefore) {
        console.log(`[Retention] Dataset ${report.datasetId} expires in ${report.daysUntilExpiration} days`)
      }
    }
  }

  async extendRetention(datasetId: string, additionalDays: number): Promise<void> {
    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: { retentionExpiresAt: true },
    })

    if (!dataset || !dataset.retentionExpiresAt) {
      throw new Error('Dataset or retention policy not found')
    }

    const newExpiresAt = new Date(dataset.retentionExpiresAt)
    newExpiresAt.setDate(newExpiresAt.getDate() + additionalDays)

    await prisma.dataset.update({
      where: { datasetId },
      data: { retentionExpiresAt: newExpiresAt },
    })
  }

  async getRetentionStats(tenantId: string): Promise<{
    totalDatasets: number
    datasetsWithRetention: number
    expiredDatasets: number
    expiringIn7Days: number
    expiringIn30Days: number
  }> {
    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const [total, withRetention, expired, expiring7, expiring30] = await Promise.all([
      prisma.dataset.count({ where: { tenantId } }),
      prisma.dataset.count({ where: { tenantId, retentionExpiresAt: { not: null } } }),
      prisma.dataset.count({ where: { tenantId, retentionExpiresAt: { lte: now } } }),
      prisma.dataset.count({ where: { tenantId, retentionExpiresAt: { lte: in7Days, gte: now } } }),
      prisma.dataset.count({ where: { tenantId, retentionExpiresAt: { lte: in30Days, gte: now } } }),
    ])

    return {
      totalDatasets: total,
      datasetsWithRetention: withRetention,
      expiredDatasets: expired,
      expiringIn7Days: expiring7,
      expiringIn30Days: expiring30,
    }
  }
}
