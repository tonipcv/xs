/**
 * Storage Tracking Service
 * Handles storage usage tracking, snapshot creation, and GB-hours calculation
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { redis as RedisCompat } from '@/lib/redis'

export interface StorageSnapshot {
  id: string
  tenantId: string
  datasetId?: string
  leaseId?: string
  storageBytes: bigint
  storageGb: number
  snapshotType: 'PERIODIC' | 'LEASE_START' | 'LEASE_END' | 'MANUAL' | 'DATASET_UPDATE'
  snapshotTimestamp: Date
  billingPeriod: string
  hoursInPeriod: number
  gbHours: number
  metadata?: Record<string, any>
}

export interface StorageUsageSummary {
  tenantId: string
  period: { start: Date; end: Date }
  totalGbHours: number
  avgStorageGb: number
  peakStorageGb: number
  snapshotCount: number
  breakdown: {
    byDataset: Record<string, { gbHours: number; avgGb: number; peakGb: number }>
    byLease: Record<string, { gbHours: number; avgGb: number; peakGb: number }>
  }
}

export interface CurrentStorageMetrics {
  tenantId: string
  totalStorageGb: number
  totalStorageBytes: bigint
  datasetCount: number
  lastUpdated: Date
  datasets: Array<{
    datasetId: string
    storageGb: number
    storageBytes: bigint
    lastSnapshot: Date
  }>
}

export class StorageService {
  private static readonly REDIS_PREFIX = 'storage:'
  private static readonly SNAPSHOT_INTERVAL_HOURS = 1 // Hourly snapshots
  private static readonly BYTES_PER_GB = 1073741824 // 1024^3

  /**
   * Create a storage snapshot
   */
  static async createSnapshot(params: {
    tenantId: string
    datasetId?: string
    leaseId?: string
    storageBytes: bigint
    snapshotType?: StorageSnapshot['snapshotType']
    billingPeriod?: string
    hoursInPeriod?: number
  }): Promise<StorageSnapshot> {
    const {
      tenantId,
      datasetId,
      leaseId,
      storageBytes,
      snapshotType = 'PERIODIC',
      billingPeriod,
      hoursInPeriod = 1.0,
    } = params

    // Basic input validation
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new Error('Invalid tenantId')
    }
    if (typeof storageBytes !== 'bigint' || storageBytes < BigInt(0)) {
      throw new Error('Invalid storageBytes')
    }

    const now = new Date()
    const period = billingPeriod || this.getBillingPeriod(now)
    const storageGb = Number(storageBytes) / this.BYTES_PER_GB
    const gbHours = storageGb * hoursInPeriod

    const snapshotId = `ss_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Store in Redis for fast access (using compatibility wrapper)
    const redisKey = `${this.REDIS_PREFIX}snapshot:${snapshotId}`
    await RedisCompat.setex(
      redisKey,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify({
        id: snapshotId,
        tenantId,
        datasetId,
        leaseId,
        storageBytes: storageBytes.toString(),
        storageGb,
        snapshotType,
        snapshotTimestamp: now.toISOString(),
        billingPeriod: period,
        hoursInPeriod,
        gbHours,
      })
    )

    // Add to tenant's snapshot timeline
    const timelineKey = `${this.REDIS_PREFIX}timeline:${tenantId}`
    await RedisCompat.zAdd(timelineKey, { score: now.getTime(), value: snapshotId })
    await RedisCompat.expire(timelineKey, 30 * 24 * 60 * 60) // 30 days

    // Persist to database (async, non-blocking)
    this.persistSnapshotToDb({
      id: snapshotId,
      tenantId,
      datasetId,
      leaseId,
      storageBytes,
      storageGb,
      snapshotType,
      snapshotTimestamp: now,
      billingPeriod: period,
      hoursInPeriod,
      gbHours,
    }).catch(err => console.error('[StorageService] Failed to persist snapshot:', err))

    return {
      id: snapshotId,
      tenantId,
      datasetId,
      leaseId,
      storageBytes,
      storageGb,
      snapshotType,
      snapshotTimestamp: now,
      billingPeriod: period,
      hoursInPeriod,
      gbHours,
    }
  }

  /**
   * Persist snapshot to database
   */
  private static async persistSnapshotToDb(snapshot: StorageSnapshot): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO xase_storage_snapshots (
          id, tenant_id, dataset_id, lease_id,
          storage_bytes, storage_gb, snapshot_type,
          snapshot_timestamp, billing_period, hours_in_period,
          metadata, created_at
        ) VALUES (
          ${snapshot.id}, ${snapshot.tenantId}, ${snapshot.datasetId}, ${snapshot.leaseId},
          ${snapshot.storageBytes.toString()}, ${snapshot.storageGb}, ${snapshot.snapshotType},
          ${snapshot.snapshotTimestamp}, ${snapshot.billingPeriod}, ${snapshot.hoursInPeriod},
          ${JSON.stringify(snapshot.metadata || {})}::jsonb, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `
    } catch (error) {
      console.error('[StorageService] Database persist error:', error)
      throw error
    }
  }

  /**
   * Track storage for a dataset
   */
  static async trackDatasetStorage(
    tenantId: string,
    datasetId: string,
    storageBytes: bigint
  ): Promise<StorageSnapshot> {
    return this.createSnapshot({
      tenantId,
      datasetId,
      storageBytes,
      snapshotType: 'DATASET_UPDATE',
    })
  }

  /**
   * Track storage for a lease (start)
   */
  static async trackLeaseStorageStart(
    tenantId: string,
    leaseId: string,
    datasetId: string,
    storageBytes: bigint
  ): Promise<StorageSnapshot> {
    return this.createSnapshot({
      tenantId,
      datasetId,
      leaseId,
      storageBytes,
      snapshotType: 'LEASE_START',
    })
  }

  /**
   * Track storage for a lease (end)
   */
  static async trackLeaseStorageEnd(
    tenantId: string,
    leaseId: string,
    datasetId: string,
    storageBytes: bigint,
    hoursActive: number
  ): Promise<StorageSnapshot> {
    return this.createSnapshot({
      tenantId,
      datasetId,
      leaseId,
      storageBytes,
      snapshotType: 'LEASE_END',
      hoursInPeriod: hoursActive,
    })
  }

  /**
   * Calculate storage GB-hours for a period
   */
  static async calculateGbHours(
    tenantId: string,
    start: Date,
    end: Date,
    datasetId?: string
  ): Promise<number> {
    try {
      // Try database first with safe SQL composition
      const datasetFilter = datasetId
        ? Prisma.sql` AND dataset_id = ${datasetId}`
        : Prisma.empty;

      const result = await prisma.$queryRaw<Array<{ total: number }>>(
        Prisma.sql`
          SELECT COALESCE(SUM(gb_hours), 0) as total
          FROM xase_storage_snapshots
          WHERE tenant_id = ${tenantId}
            AND snapshot_timestamp >= ${start}
            AND snapshot_timestamp <= ${end}
            ${datasetFilter}
        `
      )
      
      if (result && result[0]) {
        return Number(result[0].total)
      }
    } catch (error) {
      console.warn('[StorageService] Database query failed, falling back to Redis:', error)
    }

    // Fallback to Redis
    return this.calculateGbHoursFromRedis(tenantId, start, end, datasetId)
  }

  /**
   * Calculate GB-hours from Redis cache
   */
  private static async calculateGbHoursFromRedis(
    tenantId: string,
    start: Date,
    end: Date,
    datasetId?: string
  ): Promise<number> {
    const timelineKey = `${this.REDIS_PREFIX}timeline:${tenantId}`
    
    const snapshotIds = await RedisCompat.zRangeByScore(
      timelineKey,
      start.getTime(),
      end.getTime()
    )

    let totalGbHours = 0

    for (const snapshotId of snapshotIds) {
      const snapshotKey = `${this.REDIS_PREFIX}snapshot:${snapshotId}`
      const snapshotData = await RedisCompat.get(snapshotKey)
      
      if (snapshotData) {
        const snapshot = JSON.parse(snapshotData)
        
        // Filter by dataset if specified
        if (!datasetId || snapshot.datasetId === datasetId) {
          totalGbHours += snapshot.gbHours || 0
        }
      }
    }

    return totalGbHours
  }

  /**
   * Get storage usage summary for a period
   */
  static async getUsageSummary(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<StorageUsageSummary> {
    try {
      const snapshots = await prisma.$queryRaw<Array<{
        dataset_id: string | null
        lease_id: string | null
        total_gb_hours: number
        avg_storage_gb: number
        peak_storage_gb: number
        snapshot_count: number
      }>>`
        SELECT 
          dataset_id,
          lease_id,
          SUM(gb_hours) as total_gb_hours,
          AVG(storage_gb) as avg_storage_gb,
          MAX(storage_gb) as peak_storage_gb,
          COUNT(*) as snapshot_count
        FROM xase_storage_snapshots
        WHERE tenant_id = ${tenantId}
          AND snapshot_timestamp >= ${start}
          AND snapshot_timestamp <= ${end}
        GROUP BY dataset_id, lease_id
      `

      const totalGbHours = snapshots.reduce((sum, s) => sum + Number(s.total_gb_hours), 0)
      const avgStorageGb = snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + Number(s.avg_storage_gb), 0) / snapshots.length
        : 0
      const peakStorageGb = Math.max(...snapshots.map(s => Number(s.peak_storage_gb)), 0)
      const snapshotCount = snapshots.reduce((sum, s) => sum + Number(s.snapshot_count), 0)

      const breakdown = {
        byDataset: {} as Record<string, any>,
        byLease: {} as Record<string, any>,
      }

      for (const snapshot of snapshots) {
        if (snapshot.dataset_id) {
          breakdown.byDataset[snapshot.dataset_id] = {
            gbHours: Number(snapshot.total_gb_hours),
            avgGb: Number(snapshot.avg_storage_gb),
            peakGb: Number(snapshot.peak_storage_gb),
          }
        }

        if (snapshot.lease_id) {
          breakdown.byLease[snapshot.lease_id] = {
            gbHours: Number(snapshot.total_gb_hours),
            avgGb: Number(snapshot.avg_storage_gb),
            peakGb: Number(snapshot.peak_storage_gb),
          }
        }
      }

      return {
        tenantId,
        period: { start, end },
        totalGbHours,
        avgStorageGb,
        peakStorageGb,
        snapshotCount,
        breakdown,
      }
    } catch (error) {
      console.error('[StorageService] Failed to get usage summary:', error)
      throw error
    }
  }

  /**
   * Get current storage metrics for a tenant
   */
  static async getCurrentStorage(tenantId: string): Promise<CurrentStorageMetrics> {
    try {
      const datasets = await prisma.$queryRaw<Array<{
        dataset_id: string
        storage_gb: number
        storage_bytes: string
        snapshot_timestamp: Date
      }>>`
        WITH latest_snapshots AS (
          SELECT DISTINCT ON (dataset_id)
            dataset_id,
            storage_gb,
            storage_bytes,
            snapshot_timestamp
          FROM xase_storage_snapshots
          WHERE tenant_id = ${tenantId}
            AND dataset_id IS NOT NULL
          ORDER BY dataset_id, snapshot_timestamp DESC
        )
        SELECT * FROM latest_snapshots
      `

      const totalStorageGb = datasets.reduce((sum, d) => sum + Number(d.storage_gb), 0)
      const totalStorageBytes = datasets.reduce(
        (sum, d) => sum + BigInt(d.storage_bytes),
        BigInt(0)
      )
      const lastUpdated = datasets.length > 0
        ? new Date(Math.max(...datasets.map(d => d.snapshot_timestamp.getTime())))
        : new Date()

      return {
        tenantId,
        totalStorageGb,
        totalStorageBytes,
        datasetCount: datasets.length,
        lastUpdated,
        datasets: datasets.map(d => ({
          datasetId: d.dataset_id,
          storageGb: Number(d.storage_gb),
          storageBytes: BigInt(d.storage_bytes),
          lastSnapshot: d.snapshot_timestamp,
        })),
      }
    } catch (error) {
      console.error('[StorageService] Failed to get current storage:', error)
      throw error
    }
  }

  /**
   * Create periodic snapshots for all active leases
   */
  static async createPeriodicSnapshots(): Promise<number> {
    try {
      const activeLeases = await prisma.accessLease.findMany({
        where: {
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        include: {
          dataset: {
            select: {
              id: true,
              totalSizeBytes: true,
            },
          },
        },
      })

      let snapshotCount = 0

      for (const lease of activeLeases) {
        await this.createSnapshot({
          tenantId: lease.clientTenantId,
          datasetId: lease.datasetId,
          leaseId: lease.id,
          storageBytes: lease.dataset.totalSizeBytes,
          snapshotType: 'PERIODIC',
          hoursInPeriod: 1.0,
        })
        snapshotCount++
      }

      console.log(`[StorageService] Created ${snapshotCount} periodic snapshots`)
      return snapshotCount
    } catch (error) {
      console.error('[StorageService] Failed to create periodic snapshots:', error)
      return 0
    }
  }

  /**
   * Get billing period string (YYYY-MM)
   */
  private static getBillingPeriod(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  /**
   * Update dataset storage size
   */
  static async updateDatasetStorage(
    datasetId: string,
    storageBytes: bigint
  ): Promise<void> {
    try {
      const dataset = await prisma.dataset.findUnique({
        where: { id: datasetId },
        select: { tenantId: true },
      })

      if (!dataset) {
        throw new Error(`Dataset ${datasetId} not found`)
      }

      // Update dataset
      await prisma.dataset.update({
        where: { id: datasetId },
        data: { totalSizeBytes: storageBytes },
      })

      // Create snapshot
      await this.trackDatasetStorage(dataset.tenantId, datasetId, storageBytes)
    } catch (error) {
      console.error('[StorageService] Failed to update dataset storage:', error)
      throw error
    }
  }

  /**
   * Calculate storage cost
   */
  static calculateStorageCost(
    gbHours: number,
    pricePerGbMonth: number = 0.023 // AWS S3 Standard pricing
  ): number {
    // Convert GB-hours to GB-months (730 hours per month average)
    const gbMonths = gbHours / 730
    return gbMonths * pricePerGbMonth
  }
}
