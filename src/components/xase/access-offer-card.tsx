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
    LOW: 'bg-green-100 text-green-800 border-green-300',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
    CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{offer.title}</CardTitle>
            <CardDescription className="line-clamp-2">
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
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{offer.supplier.name}</span>
          <Badge variant="outline" className="text-xs">
            {offer.supplier.organizationType}
          </Badge>
        </div>

        {/* Pricing */}
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-lg font-bold">
            {offer.currency} {offer.pricePerHour}/hr
          </span>
          <span className="text-sm text-muted-foreground">
            • {offer.scopeHours}h scope
          </span>
        </div>

        {/* Jurisdiction & Language */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span>{offer.jurisdiction}</span>
          </div>
          <Badge variant="secondary">{offer.language}</Badge>
        </div>

        {/* Trust Signals */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>{offer.successfulAudits} audits</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            <Clock className="h-4 w-4" />
            <span>{offer.totalExecutions} executions</span>
          </div>
        </div>

        {/* Use Cases */}
        {offer.useCases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.useCases.slice(0, 3).map((useCase) => (
              <Badge key={useCase} variant="outline" className="text-xs">
                {useCase}
              </Badge>
            ))}
            {offer.useCases.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{offer.useCases.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Link href={`/xase/governed-access/${offer.offerId}`} className="w-full">
          <Button className="w-full">View Contract Details</Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
