/**
 * Billing Service
 * Comprehensive billing system with storage, compute, and data processing costs
 */

import { prisma } from '@/lib/prisma'
import { MeteringService } from './metering-service'
import { StorageService } from './storage-service'

export interface UsageRecord {
  executionId: string
  bytesProcessed: bigint
  computeHours: number
  storageGbHours?: number
  cost: number
}

export interface MonthlyUsage {
  period: {
    start: Date
    end: Date
  }
  usage: {
    bytesProcessed: bigint
    computeHours: number
    storageGbHours: number
  }
  costs: {
    dataProcessing: number
    compute: number
    storage: number
    total: number
  }
  breakdown: {
    byDataset: Record<string, any>
    byLease: Record<string, any>
  }
}

export interface Invoice {
  id: string
  tenantId: string
  period: string
  amount: number
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  dueDate: Date
  metadata: {
    usage: MonthlyUsage['usage']
    breakdown: MonthlyUsage['costs']
    itemizedCharges: Array<{
      description: string
      quantity: number
      unitPrice: number
      total: number
    }>
  }
  createdAt: Date
}

export interface BillingRates {
  dataProcessingPerGb: number
  computePerHour: number
  storagePerGbMonth: number
  storagePerGbHour: number
}

export class BillingService {
  private static readonly DEFAULT_RATES: BillingRates = {
    dataProcessingPerGb: 0.05, // $0.05 per GB processed
    computePerHour: 0.10, // $0.10 per compute hour
    storagePerGbMonth: 0.023, // AWS S3 Standard pricing
    storagePerGbHour: 0.000032, // ~$0.023/GB-month / 730 hours
  }

  /**
   * Record usage from policy execution
   */
  static async recordUsage(
    tenantId: string,
    usage: UsageRecord
  ): Promise<void> {
    const cost = usage.cost

    // Create credit ledger entry
    await prisma.creditLedger.create({
      data: {
        tenantId,
        amount: -cost,
        eventType: 'USAGE',
        description: `Data processing - ${this.formatBytes(Number(usage.bytesProcessed))}`,
        metadata: {
          executionId: usage.executionId,
          bytesProcessed: usage.bytesProcessed.toString(),
          computeHours: usage.computeHours,
          storageGbHours: usage.storageGbHours || 0,
          timestamp: new Date().toISOString(),
        },
        balanceAfter: 0, // Will be calculated
      },
    })

    // Record in metering service
    await MeteringService.recordUsage({
      tenantId,
      metric: 'bytes',
      value: Number(usage.bytesProcessed),
      timestamp: new Date(),
      metadata: { executionId: usage.executionId },
    })

    await MeteringService.recordUsage({
      tenantId,
      metric: 'hours',
      value: usage.computeHours,
      timestamp: new Date(),
      metadata: { executionId: usage.executionId },
    })

    if (usage.storageGbHours) {
      await MeteringService.recordUsage({
        tenantId,
        metric: 'storage_gb_hours',
        value: usage.storageGbHours,
        timestamp: new Date(),
        metadata: { executionId: usage.executionId },
      })
    }

    // Check balance
    const balance = await this.getBalance(tenantId)
    if (balance < 0) {
      console.warn(`[Billing] Low balance for tenant ${tenantId}: ${balance}`)
      // TODO: Send notification
    }
  }

  /**
   * Get tenant balance
   */
  static async getBalance(tenantId: string): Promise<number> {
    const ledger = await prisma.creditLedger.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (ledger.length === 0) return 0
    return Number(ledger[0].balanceAfter)
  }

  /**
   * Calculate monthly usage with storage
   */
  static async getMonthlyUsage(
    tenantId: string,
    month: Date,
    rates: Partial<BillingRates> = {}
  ): Promise<MonthlyUsage> {
    const billingRates = { ...this.DEFAULT_RATES, ...rates }
    
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59)

    // Get policy executions
    const executions = await prisma.policyExecution.findMany({
      where: {
        buyerTenantId: tenantId,
        startedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        offer: {
          select: {
            datasetId: true,
          },
        },
      },
    })

    // Calculate bytes and compute
    const totalBytesProcessed = executions.reduce(
      (sum, e) => sum + BigInt(e.bytesStreamed || 0),
      BigInt(0)
    )

    const totalComputeSeconds = executions.reduce((sum, e) => {
      if (!e.startedAt || !e.completedAt) return sum
      return sum + (e.completedAt.getTime() - e.startedAt.getTime()) / 1000
    }, 0)

    const computeHours = totalComputeSeconds / 3600

    // Calculate storage GB-hours
    const storageGbHours = await StorageService.calculateGbHours(
      tenantId,
      startOfMonth,
      endOfMonth
    )

    // Get storage summary for breakdown
    const storageSummary = await StorageService.getUsageSummary(
      tenantId,
      startOfMonth,
      endOfMonth
    )

    // Calculate costs
    const bytesProcessedGb = Number(totalBytesProcessed) / (1024 ** 3)
    const dataProcessingCost = bytesProcessedGb * billingRates.dataProcessingPerGb
    const computeCost = computeHours * billingRates.computePerHour
    const storageCost = storageGbHours * billingRates.storagePerGbHour

    const totalCost = dataProcessingCost + computeCost + storageCost

    // Build breakdown by dataset
    const byDataset: Record<string, any> = {}
    for (const execution of executions) {
      const datasetId = execution.offer.datasetId
      if (!byDataset[datasetId]) {
        byDataset[datasetId] = {
          bytesProcessed: BigInt(0),
          computeHours: 0,
          storageGbHours: 0,
          cost: 0,
        }
      }

      byDataset[datasetId].bytesProcessed += BigInt(execution.bytesStreamed || 0)
      
      if (execution.startedAt && execution.completedAt) {
        const hours = (execution.completedAt.getTime() - execution.startedAt.getTime()) / (1000 * 3600)
        byDataset[datasetId].computeHours += hours
      }

      // Add storage from summary
      if (storageSummary.breakdown.byDataset[datasetId]) {
        byDataset[datasetId].storageGbHours = storageSummary.breakdown.byDataset[datasetId].gbHours
      }

      // Calculate cost for this dataset
      const dsBytes = Number(byDataset[datasetId].bytesProcessed) / (1024 ** 3)
      byDataset[datasetId].cost = 
        (dsBytes * billingRates.dataProcessingPerGb) +
        (byDataset[datasetId].computeHours * billingRates.computePerHour) +
        (byDataset[datasetId].storageGbHours * billingRates.storagePerGbHour)
    }

    // Build breakdown by lease
    const byLease: Record<string, any> = {}
    for (const execution of executions) {
      const leaseId = execution.leaseId
      if (!byLease[leaseId]) {
        byLease[leaseId] = {
          bytesProcessed: BigInt(0),
          computeHours: 0,
          storageGbHours: 0,
          cost: 0,
        }
      }

      byLease[leaseId].bytesProcessed += BigInt(execution.bytesStreamed || 0)
      
      if (execution.startedAt && execution.completedAt) {
        const hours = (execution.completedAt.getTime() - execution.startedAt.getTime()) / (1000 * 3600)
        byLease[leaseId].computeHours += hours
      }

      // Add storage from summary
      if (storageSummary.breakdown.byLease[leaseId]) {
        byLease[leaseId].storageGbHours = storageSummary.breakdown.byLease[leaseId].gbHours
      }

      // Calculate cost for this lease
      const leaseBytes = Number(byLease[leaseId].bytesProcessed) / (1024 ** 3)
      byLease[leaseId].cost = 
        (leaseBytes * billingRates.dataProcessingPerGb) +
        (byLease[leaseId].computeHours * billingRates.computePerHour) +
        (byLease[leaseId].storageGbHours * billingRates.storagePerGbHour)
    }

    return {
      period: {
        start: startOfMonth,
        end: endOfMonth,
      },
      usage: {
        bytesProcessed: totalBytesProcessed,
        computeHours,
        storageGbHours,
      },
      costs: {
        dataProcessing: dataProcessingCost,
        compute: computeCost,
        storage: storageCost,
        total: totalCost,
      },
      breakdown: {
        byDataset,
        byLease,
      },
    }
  }

  /**
   * Generate invoice for a month
   */
  static async generateInvoice(
    tenantId: string,
    month: Date,
    rates?: Partial<BillingRates>
  ): Promise<Invoice> {
    const usage = await this.getMonthlyUsage(tenantId, month, rates)
    const billingRates = { ...this.DEFAULT_RATES, ...rates }

    const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
    const dueDate = new Date(month.getFullYear(), month.getMonth() + 1, 15)

    // Build itemized charges
    const itemizedCharges = []

    if (usage.costs.dataProcessing > 0) {
      const bytesGb = Number(usage.usage.bytesProcessed) / (1024 ** 3)
      itemizedCharges.push({
        description: 'Data Processing',
        quantity: bytesGb,
        unitPrice: billingRates.dataProcessingPerGb,
        total: usage.costs.dataProcessing,
      })
    }

    if (usage.costs.compute > 0) {
      itemizedCharges.push({
        description: 'Compute Hours',
        quantity: usage.usage.computeHours,
        unitPrice: billingRates.computePerHour,
        total: usage.costs.compute,
      })
    }

    if (usage.costs.storage > 0) {
      itemizedCharges.push({
        description: 'Storage (GB-hours)',
        quantity: usage.usage.storageGbHours,
        unitPrice: billingRates.storagePerGbHour,
        total: usage.costs.storage,
      })
    }

    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`

    const invoice: Invoice = {
      id: invoiceId,
      tenantId,
      period,
      amount: usage.costs.total,
      status: 'PENDING',
      dueDate,
      metadata: {
        usage: usage.usage,
        breakdown: usage.costs,
        itemizedCharges,
      },
      createdAt: new Date(),
    }

    // Store invoice in audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'INVOICE_GENERATED',
        resourceType: 'invoice',
        resourceId: invoiceId,
        metadata: JSON.stringify(invoice, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ),
        status: 'SUCCESS',
      },
    })

    console.log(`[Billing] Generated invoice ${invoiceId} for tenant ${tenantId}: $${usage.costs.total.toFixed(2)}`)

    return invoice
  }

  /**
   * Get invoices for a tenant
   */
  static async getInvoices(
    tenantId: string,
    limit: number = 12
  ): Promise<Invoice[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'INVOICE_GENERATED',
        resourceType: 'invoice',
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return logs.map(log => {
      const invoice = log.metadata ? JSON.parse(log.metadata) : {}
      return {
        id: log.resourceId || `inv_${log.id}`,
        tenantId: log.tenantId || tenantId,
        period: invoice.period || '',
        amount: invoice.amount || 0,
        status: invoice.status || 'PENDING',
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : new Date(),
        metadata: invoice.metadata || {},
        createdAt: log.timestamp,
      }
    })
  }

  /**
   * Get current month usage (real-time)
   */
  static async getCurrentMonthUsage(
    tenantId: string,
    rates?: Partial<BillingRates>
  ): Promise<MonthlyUsage> {
    const now = new Date()
    return this.getMonthlyUsage(tenantId, now, rates)
  }

  /**
   * Calculate cost for usage
   */
  static calculateCost(
    bytesProcessed: bigint,
    computeHours: number,
    storageGbHours: number,
    rates: Partial<BillingRates> = {}
  ): number {
    const billingRates = { ...this.DEFAULT_RATES, ...rates }
    
    const bytesGb = Number(bytesProcessed) / (1024 ** 3)
    const dataProcessingCost = bytesGb * billingRates.dataProcessingPerGb
    const computeCost = computeHours * billingRates.computePerHour
    const storageCost = storageGbHours * billingRates.storagePerGbHour

    return dataProcessingCost + computeCost + storageCost
  }

  /**
   * Format bytes for display
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Get billing summary for dashboard
   */
  static async getBillingSummary(tenantId: string): Promise<{
    currentMonth: MonthlyUsage
    lastMonth: MonthlyUsage
    balance: number
    upcomingInvoice: {
      amount: number
      dueDate: Date
    }
    trends: {
      storageGrowth: number
      computeGrowth: number
      costGrowth: number
    }
  }> {
    const now = new Date()
    const currentMonth = await this.getCurrentMonthUsage(tenantId)
    
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = await this.getMonthlyUsage(tenantId, lastMonthDate)

    const balance = await this.getBalance(tenantId)

    const upcomingInvoice = {
      amount: currentMonth.costs.total,
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 15),
    }

    const trends = {
      storageGrowth: lastMonth.usage.storageGbHours > 0
        ? ((currentMonth.usage.storageGbHours - lastMonth.usage.storageGbHours) / lastMonth.usage.storageGbHours) * 100
        : 0,
      computeGrowth: lastMonth.usage.computeHours > 0
        ? ((currentMonth.usage.computeHours - lastMonth.usage.computeHours) / lastMonth.usage.computeHours) * 100
        : 0,
      costGrowth: lastMonth.costs.total > 0
        ? ((currentMonth.costs.total - lastMonth.costs.total) / lastMonth.costs.total) * 100
        : 0,
    }

    return {
      currentMonth,
      lastMonth,
      balance,
      upcomingInvoice,
      trends,
    }
  }
}
