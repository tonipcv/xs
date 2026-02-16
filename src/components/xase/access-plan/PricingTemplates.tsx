'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'

export interface PricingTemplate {
  id: string
  name: string
  description: string
  pricePerHour: number
  scopeHours: number
  maxConcurrentLeases: number
  features: string[]
  recommended?: boolean
}

const TEMPLATES: PricingTemplate[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for experimentation and small projects',
    pricePerHour: 5,
    scopeHours: 100,
    maxConcurrentLeases: 2,
    features: [
      '100 hours of data access',
      'Up to 2 concurrent leases',
      'Standard support',
      'Basic analytics',
    ]
  },
  {
    id: 'pro',
    name: 'Professional',
    description: 'Ideal for production training and fine-tuning',
    pricePerHour: 15,
    scopeHours: 1000,
    maxConcurrentLeases: 5,
    recommended: true,
    features: [
      '1,000 hours of data access',
      'Up to 5 concurrent leases',
      'Priority support',
      'Advanced analytics',
      'Auto-renew enabled',
      'Budget controls',
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solution for large-scale deployments',
    pricePerHour: 0, // Custom pricing
    scopeHours: 0,
    maxConcurrentLeases: 999,
    features: [
      'Unlimited data access',
      'Unlimited concurrent leases',
      'Dedicated support',
      'Custom SLA',
      'Multi-dataset federation',
      'Compliance reporting',
      'Custom integrations',
    ]
  }
]

interface PricingTemplatesProps {
  onSelect: (template: PricingTemplate) => void
  selectedId?: string
}

export function PricingTemplates({ onSelect, selectedId }: PricingTemplatesProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {TEMPLATES.map((template) => (
        <Card 
          key={template.id}
          className={`relative cursor-pointer transition-all hover:shadow-lg ${
            selectedId === template.id ? 'ring-2 ring-primary' : ''
          } ${template.recommended ? 'border-primary' : ''}`}
          onClick={() => onSelect(template)}
        >
          {template.recommended && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
              Recommended
            </Badge>
          )}
          
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Pricing */}
            <div className="text-center py-4 border-y">
              {template.id === 'enterprise' ? (
                <div>
                  <div className="text-3xl font-bold">Custom</div>
                  <div className="text-sm text-muted-foreground">Contact sales</div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl font-bold">
                    ${template.pricePerHour}
                    <span className="text-lg font-normal text-muted-foreground">/hour</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {template.scopeHours} hours included
                  </div>
                </div>
              )}
            </div>

            {/* Features */}
            <ul className="space-y-2">
              {template.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* Select Button */}
            <Button 
              className="w-full"
              variant={selectedId === template.id ? 'default' : 'outline'}
            >
              {selectedId === template.id ? 'Selected' : 'Select Plan'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function getTemplateById(id: string): PricingTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}

export function calculateMonthlyRevenue(template: PricingTemplate, expectedLeases: number): number {
  if (template.id === 'enterprise') return 0 // Custom pricing
  
  // Assume average 40h per lease per month
  const avgHoursPerLease = 40
  const monthlyRevenue = template.pricePerHour * avgHoursPerLease * expectedLeases
  
  return Math.round(monthlyRevenue)
}
