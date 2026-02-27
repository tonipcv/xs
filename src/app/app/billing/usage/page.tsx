import { AppLayout } from '@/components/AppSidebar';
import { requireAuth } from '@/lib/rbac';
import { Playfair_Display } from 'next/font/google';
import { BillingUsageChart } from '@/components/xase/BillingUsageChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, AlertCircle, TrendingUp, Calendar } from 'lucide-react';
import Link from 'next/link';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

async function fetchSidecarUsage(tenantId: string) {
  try {
    // In production, this would fetch from the actual Sidecar
    // For now, we'll use mock data or fetch from billing-report API
    const sidecarUrl = process.env[`SIDECAR_URL_${tenantId.toUpperCase()}`] || process.env.NEXT_PUBLIC_SIDECAR_ORIGIN;
    
    if (!sidecarUrl) {
      return null;
    }

    const response = await fetch(`${sidecarUrl}/ready`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.billing_counters || null;
  } catch (error) {
    console.error('Failed to fetch Sidecar usage:', error);
    return null;
  }
}

export default async function UsageDashboardPage() {
  const context = await requireAuth();
  
  // Fetch current usage from Sidecar
  const usage = await fetchSidecarUsage(context.tenantId!);
  
  // Mock quotas (in production, fetch from JWT claims or tenant config)
  const quotas = {
    max_images_month: 2000000, // 2M images
    max_fhir_resources_month: 500000, // 500k resources
    max_audio_minutes_month: 100000, // 100k minutes
    max_bytes_month: 1000000000000, // 1TB
  };

  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Calculate estimated charges (USD)
  const pricing = {
    dicom_per_1k: 8,
    fhir_per_1k: 3.20,
    audio_per_100: 12.80,
    text_per_1k: 2.40,
    base_monthly: 9000,
  };

  const estimatedCharges = usage ? {
    dicom: (usage.dicom_images / 1000) * pricing.dicom_per_1k,
    fhir: (usage.fhir_resources / 1000) * pricing.fhir_per_1k,
    audio: (usage.audio_minutes / 100) * pricing.audio_per_100,
    text: (usage.text_pages / 1000) * pricing.text_per_1k,
    base: pricing.base_monthly,
  } : null;

  const totalEstimated = estimatedCharges 
    ? estimatedCharges.dicom + estimatedCharges.fhir + estimatedCharges.audio + estimatedCharges.text + estimatedCharges.base
    : 0;

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight`}>
                Usage Dashboard
              </h1>
              <p className="text-sm text-gray-900">
                Real-time usage metrics and billing projections for {currentPeriod}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href={`/api/billing-report?tenant_id=${context.tenantId}&month=${currentPeriod}&format=csv`}>
                <Button variant="outline" size="sm" className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </Link>
              <Link href="/app/billing">
                <Button variant="outline" size="sm" className="border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white">
                  View Ledger
                </Button>
              </Link>
            </div>
          </div>

          {/* Alert if no Sidecar data */}
          {!usage && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <CardTitle className="text-orange-900">No Sidecar Data Available</CardTitle>
                    <CardDescription className="text-orange-900">
                      Unable to fetch usage data from Sidecar. This may be because the Sidecar is not deployed yet or the connection is not configured.
                      Contact support if this issue persists.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Estimated Invoice */}
          {usage && estimatedCharges && (
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-blue-900">Estimated Invoice for {currentPeriod}</CardTitle>
                    <CardDescription className="text-blue-900">
                      Based on current usage. Final invoice will be generated at month end.
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-900 tabular-nums">
                      ${totalEstimated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-blue-900">Total estimated</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-gray-900 mb-1">Base</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${estimatedCharges.base.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-gray-900 mb-1">DICOM</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${estimatedCharges.dicom.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-gray-900 mb-1">FHIR</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${estimatedCharges.fhir.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-gray-900 mb-1">Audio</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${estimatedCharges.audio.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <div className="text-xs text-gray-900 mb-1">Text</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${estimatedCharges.text.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage Charts */}
          {usage && (
            <BillingUsageChart
              usage={usage}
              quotas={quotas}
              period={currentPeriod}
            />
          )}

          {/* Pricing Reference */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900">Pricing Reference</CardTitle>
              <CardDescription className="text-gray-900">Current rates for your Clinical plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">DICOM Studies</div>
                  <div className="text-2xl font-bold text-gray-900">$8</div>
                  <div className="text-xs text-gray-900">per 1,000 studies</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">FHIR Records</div>
                  <div className="text-2xl font-bold text-gray-900">$3.20</div>
                  <div className="text-xs text-gray-900">per 1,000 records</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">Audio Processing</div>
                  <div className="text-2xl font-bold text-gray-900">$12.80</div>
                  <div className="text-xs text-gray-900">per 100 minutes</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">Document OCR</div>
                  <div className="text-2xl font-bold text-gray-900">$2.40</div>
                  <div className="text-xs text-gray-900">per 1,000 pages</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Help Section */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-gray-900 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-gray-900">Upgrade Your Plan</div>
                  <div className="text-sm text-gray-900">
                    Need higher quotas or volume discounts? Contact sales for Hospital Network pricing.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-900 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-gray-900">Billing Cycle</div>
                  <div className="text-sm text-gray-900">
                    Invoices are generated on the 1st of each month. Payment is due within 15 days.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-gray-900 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm text-gray-900">Quota Alerts</div>
                  <div className="text-sm text-gray-900">
                    You'll receive email alerts at 80% and 100% of your quota. Processing pauses at 100% until upgrade or next cycle.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
