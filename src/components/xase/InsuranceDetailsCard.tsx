'use client';

import { Playfair_Display } from 'next/font/google';
const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface InsuranceDecision {
  claimNumber: string | null;
  claimType: string | null;
  claimAmount: any | null;
  policyNumber: string | null;
  decisionOutcome: string | null;
  decisionOutcomeReason: string | null;
  decisionImpactConsumerImpact: string | null;
  decisionImpactFinancial: any | null;
  decisionImpactAppealable: boolean | null;
  riskScore: number | null;
  underwritingDecision: string | null;
  premiumCalculated: any | null;
}

interface InsuranceDetailsCardProps {
  insuranceDecision: InsuranceDecision;
  docMode?: boolean;
}

export function InsuranceDetailsCard({ insuranceDecision, docMode = false }: InsuranceDetailsCardProps) {
  const getImpactColor = (impact: string | null) => {
    // Neutral color for all impacts
    return 'text-white/80';
  };

  const getImpactBadge = (impact: string | null) => {
    if (!impact) return null;
    const color = 'bg-white/10 text-white/80 border-white/15';
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${color}`}>
        {impact}
      </span>
    );
  };

  const getClaimTypeBadge = (type: string | null) => {
    if (!type) return null;
    const color = 'bg-white/10 text-white/80 border-white/15';
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${color}`}>
        {type}
      </span>
    );
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return null;
    const color = 'bg-white/10 text-white/80 border-white/15';
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${color}`}>
        {outcome}
      </span>
    );
  };

  const formatCurrency = (amount: any) => {
    if (!amount) return 'N/A';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const isDoc = !!docMode;
  return (
    <div className={`${isDoc ? 'bg-white border border-gray-200 text-gray-900' : 'bg-white/[0.03] border border-white/[0.08] text-white'} rounded-xl p-4 space-y-4`}>
      <div className="flex items-center gap-2">
        <h2 className={`${heading.className} text-base font-semibold ${isDoc ? 'text-gray-900' : 'text-white'}`}>Insurance Details</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claim Information */}
        <div className="space-y-3">
          <h3 className={`text-xs font-medium uppercase tracking-wider ${isDoc ? 'text-gray-700' : 'text-white/70'}`}>Claim Information</h3>
          
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Claim Number</label>
            <p className={`text-xs font-mono mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{insuranceDecision.claimNumber || 'N/A'}</p>
          </div>

          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Claim Type</label>
            <div className="mt-1">
              {isDoc ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-300">
                  {insuranceDecision.claimType || 'N/A'}
                </span>
              ) : (
                getClaimTypeBadge(insuranceDecision.claimType)
              )}
            </div>
          </div>

          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Claim Amount</label>
            <p className={`text-xs mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{formatCurrency(insuranceDecision.claimAmount)}</p>
          </div>
        </div>

        {/* Policy Information */}
        <div className="space-y-3">
          <h3 className={`text-xs font-medium uppercase tracking-wider ${isDoc ? 'text-gray-700' : 'text-white/70'}`}>Policy Information</h3>
          
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Policy Number</label>
            <p className={`text-xs font-mono mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{insuranceDecision.policyNumber || 'N/A'}</p>
          </div>

          {insuranceDecision.riskScore !== null && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Risk Score</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>
                {(insuranceDecision.riskScore * 100).toFixed(1)}%
              </p>
            </div>
          )}

          {insuranceDecision.premiumCalculated && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Premium Calculated</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{formatCurrency(insuranceDecision.premiumCalculated)}</p>
            </div>
          )}
        </div>

        {/* Decision Outcome */}
        <div className="space-y-3">
          <h3 className={`text-xs font-medium uppercase tracking-wider ${isDoc ? 'text-gray-700' : 'text-white/70'}`}>Decision Outcome</h3>
          
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Outcome</label>
            <div className="mt-1">
              {isDoc ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-300">
                  {insuranceDecision.decisionOutcome || 'N/A'}
                </span>
              ) : (
                getOutcomeBadge(insuranceDecision.decisionOutcome)
              )}
            </div>
          </div>

          {insuranceDecision.decisionOutcomeReason && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Reason</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-800' : 'text-white/80'}`}>{insuranceDecision.decisionOutcomeReason}</p>
            </div>
          )}

          {insuranceDecision.underwritingDecision && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Underwriting Decision</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{insuranceDecision.underwritingDecision}</p>
            </div>
          )}
        </div>

        {/* Impact Assessment */}
        <div className="space-y-3">
          <h3 className={`text-xs font-medium uppercase tracking-wider ${isDoc ? 'text-gray-700' : 'text-white/70'}`}>Impact Assessment</h3>
          
          <div>
            <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Consumer Impact</label>
            <div className="mt-1">
              {isDoc ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-300">
                  {insuranceDecision.decisionImpactConsumerImpact || 'N/A'}
                </span>
              ) : (
                getImpactBadge(insuranceDecision.decisionImpactConsumerImpact)
              )}
            </div>
          </div>

          {insuranceDecision.decisionImpactFinancial && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Financial Impact</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-900' : 'text-white'}`}>{formatCurrency(insuranceDecision.decisionImpactFinancial)}</p>
            </div>
          )}

          {insuranceDecision.decisionImpactAppealable !== null && (
            <div>
              <label className={`text-[11px] uppercase tracking-wider ${isDoc ? 'text-gray-600' : 'text-white/50'}`}>Appealable</label>
              <p className={`text-xs mt-1 ${isDoc ? 'text-gray-800' : 'text-white/80'}`}>
                {insuranceDecision.decisionImpactAppealable ? 'Yes' : 'No'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
