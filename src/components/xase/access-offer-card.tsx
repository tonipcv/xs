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
    dataType?: string
    regulatoryFrameworks?: string[]
    supplier: {
      name: string
      organizationType: string
    }
  }
}

export function AccessOfferCard({ offer }: AccessOfferCardProps) {
  const riskColors = {
    LOW: 'bg-green-50 text-green-800 border-green-200',
    MEDIUM: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
    CRITICAL: 'bg-red-50 text-red-800 border-red-200',
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[15px] font-semibold text-gray-900 leading-tight flex-1">
            {offer.title}
          </h3>
          <Badge className={`text-[9px] px-1.5 py-0.5 ${riskColors[offer.riskClass as keyof typeof riskColors]}`}>
            {offer.riskClass}
          </Badge>
        </div>
        <p className="text-[12px] text-gray-600 line-clamp-2 leading-relaxed">
          {offer.description}
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 flex-1">
        {/* Supplier */}
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[12px] font-medium text-gray-900">{offer.supplier.name}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-gray-600 border-gray-200">
            {offer.supplier.organizationType}
          </Badge>
        </div>

        {/* Pricing */}
        <div className="flex items-center gap-2">
          <DollarSign className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[14px] font-bold text-gray-900">
            {offer.currency} {offer.pricePerHour}/hr
          </span>
          <span className="text-[11px] text-gray-500">
            • {offer.scopeHours}h scope
          </span>
        </div>

        {/* Jurisdiction & Language */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[11px] text-gray-700">{offer.jurisdiction}</span>
          </div>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-gray-100 text-gray-700 border-0">
            {offer.language}
          </Badge>
          {offer.dataType && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-gray-700 border-gray-200">
              {offer.dataType}
            </Badge>
          )}
        </div>

        {/* Trust Signals */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="text-[11px] text-gray-700">{offer.successfulAudits} audits</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[11px] text-gray-700">{offer.totalExecutions} executions</span>
          </div>
        </div>

        {/* Use Cases */}
        {offer.useCases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.useCases.slice(0, 3).map((useCase) => (
              <Badge key={useCase} variant="outline" className="text-[9px] px-1.5 py-0 text-gray-600 border-gray-200">
                {useCase}
              </Badge>
            ))}
            {offer.useCases.length > 3 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-gray-600 border-gray-200">
                +{offer.useCases.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Regulatory frameworks */}
        {Array.isArray(offer.regulatoryFrameworks) && offer.regulatoryFrameworks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.regulatoryFrameworks.slice(0, 3).map((rf) => (
              <Badge key={rf} variant="secondary" className="text-[9px] px-1.5 py-0 bg-gray-100 text-gray-700 border-0">
                {rf}
              </Badge>
            ))}
            {offer.regulatoryFrameworks.length > 3 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-gray-100 text-gray-700 border-0">
                +{offer.regulatoryFrameworks.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100">
        <Link href={`/app/marketplace/${offer.offerId}`} className="block">
          <Button variant="outline" className="w-full h-7 text-[11px] border-gray-300 text-gray-900 bg-white hover:bg-gray-50">
            View Details
          </Button>
        </Link>
      </div>
    </div>
  )
}
