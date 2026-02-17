'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Shield, Clock, DollarSign, Globe, CheckCircle2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface AccessOfferCardProps {
  offer: {
    offerId: string
    title: string
    description: string
    pricePerHour: number
    currency: string
    scopeHours: number
    riskClass: string
    jurisdiction: string
    language: string
    useCases: string[]
    successfulAudits: number
    totalExecutions: number
    supplier: {
      name: string
      organizationType: string
    }
  }
}

export function AccessOfferCard({ offer }: AccessOfferCardProps) {
  const riskColors = {
    LOW: 'bg-gray-100 text-gray-800 border-gray-300',
    MEDIUM: 'bg-gray-100 text-gray-800 border-gray-300',
    HIGH: 'bg-gray-100 text-gray-800 border-gray-300',
    CRITICAL: 'bg-gray-100 text-gray-800 border-gray-300',
  }

  return (
    <Card className="hover:shadow-sm transition-shadow border border-gray-200">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2 text-gray-900">{offer.title}</CardTitle>
            <CardDescription className="line-clamp-2 text-gray-900">
              {offer.description}
            </CardDescription>
          </div>
          <Badge className={riskColors[offer.riskClass as keyof typeof riskColors]}>
            {offer.riskClass}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Supplier */}
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900">{offer.supplier.name}</span>
          <Badge variant="outline" className="text-xs text-gray-900 border-gray-300">
            {offer.supplier.organizationType}
          </Badge>
        </div>

        {/* Pricing */}
        <div className="flex items-center gap-2 text-gray-900">
          <DollarSign className="h-4 w-4 text-gray-500" />
          <span className="text-lg font-bold text-gray-900">
            {offer.currency} {offer.pricePerHour}/hr
          </span>
          <span className="text-sm text-gray-700">
            • {offer.scopeHours}h scope
          </span>
        </div>

        {/* Jurisdiction & Language */}
        <div className="flex items-center gap-4 text-sm text-gray-900">
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4 text-gray-500" />
            <span>{offer.jurisdiction}</span>
          </div>
          <Badge variant="secondary" className="text-gray-900">{offer.language}</Badge>
        </div>

        {/* Trust Signals */}
        <div className="flex items-center gap-4 text-sm text-gray-900">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-gray-500" />
            <span>{offer.successfulAudits} audits</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-gray-500" />
            <span>{offer.totalExecutions} executions</span>
          </div>
        </div>

        {/* Use Cases */}
        {offer.useCases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.useCases.slice(0, 3).map((useCase) => (
              <Badge key={useCase} variant="outline" className="text-xs text-gray-900 border-gray-300">
                {useCase}
              </Badge>
            ))}
            {offer.useCases.length > 3 && (
              <Badge variant="outline" className="text-xs text-gray-900 border-gray-300">
                +{offer.useCases.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Link href={`/xase/governed-access/${offer.offerId}`} className="w-full">
          <Button variant="outline" className="w-full border border-gray-300 text-gray-900 bg-white hover:bg-gray-50">View Contract Details</Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
