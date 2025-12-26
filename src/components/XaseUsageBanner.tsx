"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface UsageData {
  tokensUsedThisMonth: number;
  freeTokensLimit: number;
  percentage: number;
  planTier: string;
  daysUntilReset: number;
}

export default function XaseUsageBanner() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/user/usage', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setUsage(data);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading || !usage) return null;

  const reached = usage.percentage >= 100 && usage.freeTokensLimit < 999999999;
  const near = usage.percentage >= 80 && !reached;

  return (
    <div className="space-y-3">
      <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-2 ${usage.percentage >= 90 ? 'bg-red-500' : usage.percentage >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${Math.min(usage.percentage, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>
          {usage.tokensUsedThisMonth.toLocaleString()} / {usage.freeTokensLimit >= 999999999 ? 'Unlimited' : usage.freeTokensLimit.toLocaleString()} tokens — resets in {usage.daysUntilReset} days
        </span>
        {usage.planTier === 'sandbox' ? (
          <a href="/planos">
            <Button size="sm" className="bg-white/[0.08] hover:bg-white/[0.14] text-white">Upgrade</Button>
          </a>
        ) : (
          <Button size="sm" onClick={openPortal} disabled={portalLoading} className="bg-white/[0.08] hover:bg-white/[0.14] text-white">
            {portalLoading ? 'Opening…' : 'Manage Billing'}
          </Button>
        )}
      </div>

      {near && (
        <div className="text-[11px] text-yellow-400/90">You're approaching your monthly limit.</div>
      )}

      {reached && (
        <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center justify-between">
          <span>Monthly limit reached. Upgrade or manage billing to continue.</span>
          {usage.planTier === 'sandbox' ? (
            <a href="/planos">
              <Button size="sm" className="bg-red-500/20 hover:bg-red-500/30 text-red-100">Upgrade</Button>
            </a>
          ) : (
            <Button size="sm" onClick={openPortal} disabled={portalLoading} className="bg-red-500/20 hover:bg-red-500/30 text-red-100">Manage Billing</Button>
          )}
        </div>
      )}
    </div>
  );
}
