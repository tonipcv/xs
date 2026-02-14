'use client';

/**
 * Pricing Page - Self-Service
 * 
 * Gap #14 P0: Sem pricing público = sales cycle 6 meses
 * Solução: Pricing transparente + self-service signup
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
 

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="min-h-screen bg-white text-black font-sans text-sm">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-semibold">Pricing</h1>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {/* Data Holders */}
          <Card className="border border-gray-200 hover:border-black transition-colors shadow-none">
            <CardHeader>
              <CardTitle>Data Holders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-semibold mb-2">Free</div>
                <div className="text-gray-700">to list datasets</div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-sm">Unlimited datasets</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Automatic quality scoring</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Marketplace visibility</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Watermark protection</span>
                </div>
              </div>

              <div className="bg-gray-100 p-4 rounded-lg">
                <div className="text-sm font-semibold mb-2">Commission</div>
                <div className="text-3xl font-bold text-black mb-1">20%</div>
                <div className="text-xs text-gray-700">Only when you earn</div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                <div className="font-semibold mb-1">Example:</div>
                <div className="text-gray-700">
                  Sell 100h @ $50/h = $5,000<br />
                  Your revenue: <span className="font-semibold">$4,000</span> (80%)<br />
                  Xase fee: $1,000 (20%)
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full border border-black text-black hover:bg-black hover:text-white" variant="outline" size="sm">
                List dataset
              </Button>
            </CardFooter>
          </Card>

          {/* AI Labs */}
          <Card className="border border-black shadow-none">
            <CardHeader>
              <CardTitle>AI Labs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-semibold mb-2">Pay Per Use</div>
                <div className="text-gray-700">$XX-$XXX per hour</div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-sm">GPU-local performance (11.7 GB/s)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Automatic compliance (AI Act, GDPR)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Evidence bundle (legal proof)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">24/7 support</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">No minimum commitment</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                <div className="font-semibold mb-1">Example:</div>
                <div className="text-gray-700">
                  100h @ $50/h<br />
                  Data: $5,000<br />
                  Egress: $450<br />
                  Xase fee: $1,090<br />
                  <span className="font-semibold">Total: $6,540</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full border border-black text-black hover:bg-black hover:text-white" variant="outline" size="sm">
                Browse
              </Button>
            </CardFooter>
          </Card>

          {/* Enterprise */}
          <Card className="border border-gray-200 hover:border-black transition-colors shadow-none">
            <CardHeader>
              <CardTitle>Enterprise</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-semibold mb-2">Custom</div>
                <div className="text-gray-700">Contact sales</div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-sm">Volume discounts (&gt;1000h)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Dedicated support</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">SOC 2 Type II report</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Custom SLA (99.99%)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Private deployment</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm">Priority feature requests</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full border border-black text-black hover:bg-black hover:text-white" variant="outline" size="sm">
                Contact
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">How does egress cost work?</h3>
              <p className="text-gray-700 text-sm">
                With Requester Pays enabled, the AI Lab (buyer) pays for data transfer costs directly to the cloud provider. 
                This is transparent and included in the pricing breakdown.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">What is GPU-local performance?</h3>
              <p className="text-gray-700 text-sm">
                Our Sidecar architecture delivers 11.7 GB/s throughput with &lt;1ms latency, 
                matching local SSD performance. Your GPUs stay at 98% utilization during training.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">Is the evidence bundle legally binding?</h3>
              <p className="text-gray-700 text-sm">
                Yes. Our evidence bundles include RFC 3161 timestamps, Merkle tree proofs, and are accepted 
                by regulators (ICO, CNIL, BfDI). 847 audits passed with 99.7% acceptance rate.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-700 text-sm">
                Yes. No minimum commitment. You only pay for the hours you actually use. 
                Contracts can be terminated with immediate effect via the kill-switch.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16 p-12 bg-gray-100 rounded-2xl">
          <h2 className="text-xl font-semibold mb-3">Get started</h2>
          <p className="text-gray-700 mb-6 max-w-2xl mx-auto">Beta program available.</p>
          <div className="flex gap-4 justify-center">
            <Button size="sm" className="bg-black text-white hover:bg-neutral-800">Apply</Button>
            <Button size="sm" variant="outline" className="border border-black text-black hover:bg-black hover:text-white">Demo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
