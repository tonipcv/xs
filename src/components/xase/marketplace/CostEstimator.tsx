'use client'

import { useState, useEffect } from 'react'
import { calculateCost, formatCurrency, formatHours, recommendAutoRenew, type CostBreakdown } from '@/lib/xase/cost-calculator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'

interface CostEstimatorProps {
  datasetSizeHours: number
  pricePerHour: number
  onEstimateChange?: (estimate: CostBreakdown) => void
}

export function CostEstimator({ datasetSizeHours, pricePerHour, onEstimateChange }: CostEstimatorProps) {
  const [epochs, setEpochs] = useState(3)
  const [gpuType, setGpuType] = useState<'H100' | 'H200' | 'A100' | 'V100'>('H100')
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)

  useEffect(() => {
    const newEstimate = calculateCost({
      datasetSizeHours,
      epochs,
      pricePerHour,
      gpuType
    })
    setEstimate(newEstimate)
    onEstimateChange?.(newEstimate)
  }, [datasetSizeHours, epochs, pricePerHour, gpuType, onEstimateChange])

  const autoRenewConfig = estimate ? recommendAutoRenew(estimate.estimatedTrainingHours) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Estimator</CardTitle>
        <CardDescription>
          Estimate training costs before requesting a lease
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="epochs">Number of Epochs</Label>
            <Input
              id="epochs"
              type="number"
              min="1"
              max="100"
              value={epochs}
              onChange={(e) => setEpochs(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gpu">GPU Type</Label>
            <Select value={gpuType} onValueChange={(v) => setGpuType(v as any)}>
              <SelectTrigger id="gpu">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="H100">H100 (Fastest)</SelectItem>
                <SelectItem value="H200">H200 (Latest)</SelectItem>
                <SelectItem value="A100">A100 (Balanced)</SelectItem>
                <SelectItem value="V100">V100 (Budget)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dataset Info */}
        <div className="bg-muted p-4 rounded-lg space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Dataset Size:</span>
            <span className="font-medium">{formatHours(datasetSizeHours)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price per Hour:</span>
            <span className="font-medium">{formatCurrency(pricePerHour)}/h</span>
          </div>
        </div>

        {/* Cost Breakdown */}
        {estimate && (
          <div className="space-y-4">
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Estimated Costs</h4>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Training Time:</span>
                  <span className="font-medium">{formatHours(estimate.estimatedTrainingHours)}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Data Hours Used:</span>
                  <span className="font-medium">{formatHours(estimate.estimatedDataHours)}</span>
                </div>

                <div className="h-px bg-border my-2" />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Data Lease Cost:</span>
                  <span className="font-medium">{formatCurrency(estimate.dataLeaseCost)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GPU Cost ({gpuType}):</span>
                  <span className="font-medium">{formatCurrency(estimate.gpuCost)}</span>
                </div>

                <div className="h-px bg-border my-2" />

                <div className="flex justify-between">
                  <span className="font-semibold">Total Estimated Cost:</span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(estimate.totalCost)}
                  </span>
                </div>
              </div>
            </div>

            {/* Auto-Renew Recommendation */}
            {autoRenewConfig && (
              <Alert>
                <InfoIcon className="h-4 w-4" />
                <AlertDescription>
                  <strong>Recommended Configuration:</strong>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>• TTL: {formatHours(autoRenewConfig.ttlSeconds / 3600)}</li>
                    <li>• Auto-renew: {autoRenewConfig.autoRenew ? 'Enabled' : 'Disabled'}</li>
                    {autoRenewConfig.autoRenew && (
                      <li>• Max renewals: {autoRenewConfig.maxRenewals}</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
