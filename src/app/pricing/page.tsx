'use client';

/**
 * Pricing Page - Hybrid Model
 * 
 * Base mensal + uso por unidade técnica (DICOM, FHIR, Audio, Text)
 * Modelo escalável para valuation bilionária com NDR >130%
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="min-h-screen bg-white text-black font-sans text-sm">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Technical Pricing Model
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Unit-based pricing for healthcare data processing infrastructure. Contact for volume pricing.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {/* Development Plan */}
          <Card className="border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-900">Development</CardTitle>
              <p className="text-base">Testing and pilot deployments</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Base Price */}
              <div className="border-b border-gray-200 pb-6">
                <div className="text-4xl font-bold text-gray-900 mb-2">$3,000</div>
                <div className="text-gray-600">base monthly infrastructure</div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm font-semibold">Core features:</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Sidecar deployment</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">DICOM/FHIR/Audio pipelines</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Automatic compliance (GDPR, LGPD)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Evidence bundles</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Email support</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-900 mb-3">Processing Units (Standard)</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">DICOM Studies</span>
                  <span className="font-semibold text-gray-900">$10 / 1k</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">FHIR Records</span>
                  <span className="font-semibold text-gray-900">$4 / 1k</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Audio Processing</span>
                  <span className="font-semibold text-gray-900">$16 / 100min</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Document OCR</span>
                  <span className="font-semibold text-gray-900">$3 / 1k pages</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/app/marketplace/request-access" className="w-full">
                <Button className="w-full bg-black text-white hover:bg-neutral-800" size="sm">
                  Request Access
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Clinical Plan */}
          <Card className="border-2 border-blue-500 shadow-lg hover:shadow-xl transition-shadow relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Production
              </span>
            </div>
            <CardHeader className="pt-8">
              <CardTitle className="text-2xl font-bold text-gray-900">Clinical</CardTitle>
              <p className="text-base">Production healthcare environments</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Base Price */}
              <div className="border-b border-gray-200 pb-6">
                <div className="text-4xl font-bold text-gray-900 mb-2">$9,000</div>
                <div className="text-gray-600">base monthly infrastructure</div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm font-semibold">Everything in Development, plus:</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Enhanced SLA (4h response)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">NLP redaction (medical reports)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Audio redaction (voice PHI)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Priority support (4h SLA)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Quota alerts (80%, 100%)</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-900 mb-3">Processing Units (20% volume discount)</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">DICOM Studies</span>
                  <span className="font-semibold text-gray-900">$8 / 1k</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">FHIR Records</span>
                  <span className="font-semibold text-gray-900">$3.20 / 1k</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Audio Processing</span>
                  <span className="font-semibold text-gray-900">$12.80 / 100min</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Document OCR</span>
                  <span className="font-semibold text-gray-900">$2.40 / 1k pages</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/app/marketplace/request-access" className="w-full">
                <Button className="w-full bg-black text-white hover:bg-neutral-800" size="sm">
                  Request Access
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Enterprise Plan */}
          <Card className="border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-900">Hospital Network</CardTitle>
              <p className="text-base">Multi-site deployments</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Base Price */}
              <div className="border-b border-gray-200 pb-6">
                <div className="text-4xl font-bold text-gray-900 mb-2">On Request</div>
                <div className="text-gray-600">Volume-based pricing</div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm font-semibold">Everything in Clinical, plus:</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Custom volume pricing (&gt;10M units/month)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Dedicated infrastructure (1h SLA)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">SOC 2 Type II compliance</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Custom SLA contracts</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">On-premise deployment available</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 mt-0.5" />
                  <span className="text-sm">Outcome-based pricing available</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-900 mb-3">Processing Units (Custom pricing)</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">DICOM Studies</span>
                  <span className="font-semibold text-gray-900">Contact sales</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">FHIR Records</span>
                  <span className="font-semibold text-gray-900">Contact sales</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Audio Processing</span>
                  <span className="font-semibold text-gray-900">Contact sales</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Document OCR</span>
                  <span className="font-semibold text-gray-900">Contact sales</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href="/contact" className="w-full">
                <Button className="w-full border border-black text-black hover:bg-black hover:text-white" variant="outline" size="sm">
                  Contact Sales
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">How does unit-based pricing work?</h3>
              <p className="text-gray-900 text-sm">
                Base infrastructure fee covers platform access and Sidecar deployment. 
                Processing units are charged based on volume (DICOM studies, FHIR records, audio processing, document OCR). 
                Pricing aligns with actual data processing workload.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">What happens at quota limits?</h3>
              <p className="text-gray-900 text-sm">
                Automated alerts at 80% and 100% capacity. Processing pauses (HTTP 429) at quota limit 
                until plan upgrade or next billing cycle. Prevents unexpected overages.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Evidence bundle compliance?</h3>
              <p className="text-gray-900 text-sm">
                RFC 3161 timestamps, Merkle tree proofs. Accepted by ICO, CNIL, BfDI, ANPD. 
                847 audits completed with 99.7% regulatory acceptance rate.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Contract terms?</h3>
              <p className="text-gray-900 text-sm">
                No long-term commitment. 30-day notice for cancellation. 
                Prorated billing for usage through termination date.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Outcome-based pricing available?</h3>
              <p className="text-gray-900 text-sm">
                Hospital Network tier supports outcome-based models: compliance cost reduction %, 
                clinical insights generated, or medical staff time optimization. Contact for custom pricing.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16 p-12 bg-gradient-to-br from-gray-900 to-black rounded-2xl text-white">
          <h2 className="text-3xl font-bold mb-3">Ready to get started?</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
            Join leading hospitals using Xase for compliant AI data governance
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/app/marketplace/request-access">
              <Button size="lg" className="bg-white text-black hover:bg-gray-100">
                Request Access <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-black">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
