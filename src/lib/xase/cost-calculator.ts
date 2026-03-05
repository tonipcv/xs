// Stubbed cost calculator for marketplace UI compatibility
export type CostBreakdown = {
  // Estimated usage
  estimatedTrainingHours: number
  estimatedDataHours: number
  // Costs
  dataLeaseCost: number
  gpuCost: number
  totalCost: number
  // Echo of inputs
  epochs: number
  pricePerHour: number
  gpuType: string
}

export function calculateCost(params: {
  datasetSizeHours: number
  epochs: number
  pricePerHour: number
  gpuType: 'H100' | 'H200' | 'A100' | 'V100'
}): CostBreakdown {
  const { datasetSizeHours, epochs, pricePerHour, gpuType } = params
  const hours = Math.max(0, Number(datasetSizeHours) || 0)
  const ep = Math.max(1, Number(epochs) || 1)

  // Very rough estimates for UI purposes only
  const estimatedDataHours = round2(hours)
  const efficiency = gpuType === 'H200' ? 0.7 : gpuType === 'H100' ? 0.8 : gpuType === 'A100' ? 0.9 : 1.0
  const estimatedTrainingHours = round2(hours * ep * efficiency)

  const dataLeaseCost = round2(estimatedDataHours * pricePerHour)

  const gpuBaseRates: Record<string, number> = { H200: 4.5, H100: 4.0, A100: 3.0, V100: 2.0 }
  const gpuRate = gpuBaseRates[gpuType] ?? 3.0
  const gpuCost = round2(estimatedTrainingHours * gpuRate)

  const totalCost = round2(dataLeaseCost + gpuCost)

  return {
    estimatedTrainingHours,
    estimatedDataHours,
    dataLeaseCost,
    gpuCost,
    totalCost,
    epochs: ep,
    pricePerHour,
    gpuType,
  }
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

export function formatHours(value: number): string {
  return `${Number(value || 0).toFixed(2)} h`
}

export function recommendAutoRenew(hours: number): { ttlSeconds: number; autoRenew: boolean; maxRenewals: number } {
  const h = Math.max(0, Number(hours) || 0)
  // Recommend TTL close to training time, allow up to 3 renewals if short
  const ttlSeconds = Math.ceil(h * 3600)
  const autoRenew = h > 0 && h < 48
  const maxRenewals = autoRenew ? 3 : 0
  return { ttlSeconds, autoRenew, maxRenewals }
}

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100
}
