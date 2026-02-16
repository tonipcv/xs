/**
 * Cost Calculator for XASE Leases
 * Estimates costs for training jobs based on dataset size, epochs, and GPU type
 */

export interface CostEstimateParams {
  datasetSizeHours: number
  epochs: number
  pricePerHour: number
  gpuType?: 'H100' | 'H200' | 'A100' | 'V100'
  batchSize?: number
  estimatedThroughput?: number // hours of data per hour of training
}

export interface CostBreakdown {
  dataLeaseCost: number
  gpuCost: number
  totalCost: number
  estimatedTrainingHours: number
  estimatedDataHours: number
  currency: string
}

const GPU_COSTS_PER_HOUR: Record<string, number> = {
  'H100': 3.0,
  'H200': 3.5,
  'A100': 1.5,
  'V100': 0.8,
}

const GPU_THROUGHPUT: Record<string, number> = {
  'H100': 10.0,  // Can process 10h of audio per 1h of training
  'H200': 12.0,
  'A100': 6.0,
  'V100': 3.0,
}

export function calculateCost(params: CostEstimateParams): CostBreakdown {
  const {
    datasetSizeHours,
    epochs,
    pricePerHour,
    gpuType = 'H100',
    estimatedThroughput
  } = params

  // Calculate throughput (hours of data processed per hour of training)
  const throughput = estimatedThroughput || GPU_THROUGHPUT[gpuType] || 10.0

  // Total data hours to process
  const totalDataHours = datasetSizeHours * epochs

  // Estimated training time
  const estimatedTrainingHours = totalDataHours / throughput

  // Data lease cost (pay for hours of data consumed)
  const dataLeaseCost = totalDataHours * pricePerHour

  // GPU cost (pay for hours of GPU time)
  const gpuCostPerHour = GPU_COSTS_PER_HOUR[gpuType] || 3.0
  const gpuCost = estimatedTrainingHours * gpuCostPerHour

  // Total cost
  const totalCost = dataLeaseCost + gpuCost

  return {
    dataLeaseCost: Math.round(dataLeaseCost * 100) / 100,
    gpuCost: Math.round(gpuCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    estimatedTrainingHours: Math.round(estimatedTrainingHours * 10) / 10,
    estimatedDataHours: totalDataHours,
    currency: 'USD'
  }
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}

export function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}min`
  }
  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = Math.round((hours % 24) * 10) / 10
  return `${days}d ${remainingHours}h`
}

export function estimateLeaseExpiry(
  startTime: Date,
  estimatedTrainingHours: number,
  bufferPercentage: number = 20
): Date {
  const bufferHours = estimatedTrainingHours * (bufferPercentage / 100)
  const totalHours = estimatedTrainingHours + bufferHours
  const expiryTime = new Date(startTime.getTime() + totalHours * 60 * 60 * 1000)
  return expiryTime
}

export function recommendTTL(estimatedTrainingHours: number): number {
  // Add 20% buffer and round up to nearest hour
  const withBuffer = estimatedTrainingHours * 1.2
  const ttlHours = Math.ceil(withBuffer)
  
  // Cap at 72h (max allowed)
  return Math.min(ttlHours * 3600, 259200)
}

export function recommendAutoRenew(estimatedTrainingHours: number): {
  autoRenew: boolean
  maxRenewals: number
  ttlSeconds: number
} {
  if (estimatedTrainingHours <= 8) {
    // Short training: single 8h lease, no auto-renew
    return {
      autoRenew: false,
      maxRenewals: 0,
      ttlSeconds: 28800 // 8h
    }
  } else if (estimatedTrainingHours <= 24) {
    // Medium training: 12h lease with 1 renewal
    return {
      autoRenew: true,
      maxRenewals: 1,
      ttlSeconds: 43200 // 12h
    }
  } else {
    // Long training: 24h lease with 2 renewals (up to 72h total)
    return {
      autoRenew: true,
      maxRenewals: 2,
      ttlSeconds: 86400 // 24h
    }
  }
}
