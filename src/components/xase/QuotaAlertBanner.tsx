'use client';

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface QuotaStatus {
  metric: string;
  current: number;
  max: number;
  percentage: number;
  unit: string;
}

interface QuotaAlertBannerProps {
  quotas: QuotaStatus[];
}

export function QuotaAlertBanner({ quotas }: QuotaAlertBannerProps) {
  // Find highest quota percentage
  const criticalQuotas = quotas.filter(q => q.percentage >= 100);
  const warningQuotas = quotas.filter(q => q.percentage >= 80 && q.percentage < 100);
  const infoQuotas = quotas.filter(q => q.percentage >= 50 && q.percentage < 80);

  if (criticalQuotas.length === 0 && warningQuotas.length === 0 && infoQuotas.length === 0) {
    return null; // No alerts needed
  }

  // Determine alert level
  const alertLevel = criticalQuotas.length > 0 ? 'critical' : warningQuotas.length > 0 ? 'warning' : 'info';

  const config = {
    critical: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-900',
      iconColor: 'text-red-600',
      title: 'Quota Exceeded',
      description: 'Processing has been paused. Upgrade your plan or wait for the next billing cycle.',
      buttonText: 'Upgrade Plan',
      buttonVariant: 'default' as const,
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-900',
      iconColor: 'text-orange-600',
      title: 'Approaching Quota Limit',
      description: 'You are approaching your monthly quota. Consider upgrading to avoid service interruption.',
      buttonText: 'View Usage',
      buttonVariant: 'outline' as const,
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-900',
      iconColor: 'text-blue-600',
      title: 'Usage Update',
      description: 'You have used over 50% of your monthly quota.',
      buttonText: 'View Details',
      buttonVariant: 'outline' as const,
    },
  };

  const currentConfig = config[alertLevel];
  const Icon = currentConfig.icon;
  const relevantQuotas = alertLevel === 'critical' ? criticalQuotas : alertLevel === 'warning' ? warningQuotas : infoQuotas;

  return (
    <Card className={`${currentConfig.bgColor} ${currentConfig.borderColor} border-2 shadow-sm`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Icon className={`h-6 w-6 ${currentConfig.iconColor} mt-0.5 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-base ${currentConfig.textColor} mb-1`}>
              {currentConfig.title}
            </h3>
            <p className={`text-sm ${currentConfig.textColor} opacity-90 mb-3`}>
              {currentConfig.description}
            </p>
            
            {/* Quota Details */}
            <div className="space-y-2 mb-4">
              {relevantQuotas.map((quota) => (
                <div key={quota.metric} className="flex items-center justify-between text-sm">
                  <span className={`font-medium ${currentConfig.textColor}`}>
                    {quota.metric}
                  </span>
                  <span className={`tabular-nums ${currentConfig.textColor}`}>
                    {quota.current.toLocaleString()} / {quota.max.toLocaleString()} {quota.unit} ({quota.percentage.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Link href="/app/billing/usage">
                <Button 
                  size="sm" 
                  variant={currentConfig.buttonVariant}
                  className={alertLevel === 'critical' ? 'bg-red-600 text-white hover:bg-red-700' : ''}
                >
                  {currentConfig.buttonText}
                </Button>
              </Link>
              {alertLevel === 'critical' && (
                <Link href="/contact">
                  <Button size="sm" variant="outline">
                    Contact Sales
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
