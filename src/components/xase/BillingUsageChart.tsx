'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, AlertTriangle } from 'lucide-react';

interface UsageData {
  dicom_images: number;
  fhir_resources: number;
  audio_minutes: number;
  text_pages: number;
  bytes_total: number;
  redactions_total: number;
}

interface QuotaData {
  max_images_month?: number;
  max_fhir_resources_month?: number;
  max_audio_minutes_month?: number;
  max_bytes_month?: number;
}

interface BillingUsageChartProps {
  usage: UsageData;
  quotas?: QuotaData;
  period: string;
}

export function BillingUsageChart({ usage, quotas, period }: BillingUsageChartProps) {
  const calculatePercentage = (current: number, max?: number) => {
    if (!max || max === 0) return 0;
    return Math.min((current / max) * 100, 100);
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return 'text-red-600 bg-red-50 border-red-200';
    if (percentage >= 80) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getBarColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-600';
    if (percentage >= 80) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-600';
  };

  const metrics = [
    {
      label: 'DICOM Images',
      value: usage.dicom_images,
      quota: quotas?.max_images_month,
      unit: 'images',
      icon: Activity,
    },
    {
      label: 'FHIR Resources',
      value: usage.fhir_resources,
      quota: quotas?.max_fhir_resources_month,
      unit: 'resources',
      icon: Activity,
    },
    {
      label: 'Audio Minutes',
      value: usage.audio_minutes,
      quota: quotas?.max_audio_minutes_month,
      unit: 'minutes',
      icon: Activity,
    },
    {
      label: 'Data Processed',
      value: usage.bytes_total / 1e9, // Convert to GB
      quota: quotas?.max_bytes_month ? quotas.max_bytes_month / 1e9 : undefined,
      unit: 'GB',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Usage Overview</h3>
          <p className="text-sm text-gray-900">Period: {period}</p>
        </div>
      </div>

      {/* Usage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.map((metric) => {
          const percentage = calculatePercentage(metric.value, metric.quota);
          const Icon = metric.icon;

          return (
            <Card key={metric.label} className="border border-gray-200 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-900">{metric.label}</CardTitle>
                  <Icon className="h-4 w-4 text-gray-900" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Value */}
                  <div>
                    <div className="text-2xl font-bold text-gray-900 tabular-nums">
                      {metric.value >= 1000 
                        ? `${(metric.value / 1000).toFixed(1)}k` 
                        : metric.value.toFixed(metric.unit === 'GB' ? 2 : 0)}
                    </div>
                    <div className="text-xs text-gray-900">
                      {metric.quota 
                        ? `of ${metric.quota >= 1000 ? `${(metric.quota / 1000).toFixed(0)}k` : metric.quota} ${metric.unit}`
                        : `${metric.unit} processed`}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {metric.quota && (
                    <div className="space-y-1">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${getBarColor(percentage)}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-900">{percentage.toFixed(1)}% used</span>
                        {percentage >= 80 && (
                          <span className={`flex items-center gap-1 ${percentage >= 100 ? 'text-red-600' : 'text-orange-600'}`}>
                            <AlertTriangle className="h-3 w-3" />
                            {percentage >= 100 ? 'Quota exceeded' : 'Near limit'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-gray-200 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Text Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              {usage.text_pages >= 1000 
                ? `${(usage.text_pages / 1000).toFixed(1)}k` 
                : usage.text_pages}
            </div>
            <div className="text-xs text-gray-900">pages processed</div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">PHI Redactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              {usage.redactions_total >= 1000 
                ? `${(usage.redactions_total / 1000).toFixed(1)}k` 
                : usage.redactions_total}
            </div>
            <div className="text-xs text-gray-900">redactions performed</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
