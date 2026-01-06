'use client';

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
}

export function InsuranceDetailsCard({ insuranceDecision }: InsuranceDetailsCardProps) {
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

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-white">Insurance Details</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claim Information */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">Claim Information</h3>
          
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Claim Number</label>
            <p className="text-xs text-white font-mono mt-1">{insuranceDecision.claimNumber || 'N/A'}</p>
          </div>

          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Claim Type</label>
            <div className="mt-1">
              {getClaimTypeBadge(insuranceDecision.claimType)}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Claim Amount</label>
            <p className="text-xs text-white mt-1">{formatCurrency(insuranceDecision.claimAmount)}</p>
          </div>
        </div>

        {/* Policy Information */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">Policy Information</h3>
          
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Policy Number</label>
            <p className="text-xs text-white font-mono mt-1">{insuranceDecision.policyNumber || 'N/A'}</p>
          </div>

          {insuranceDecision.riskScore !== null && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Risk Score</label>
              <p className="text-xs text-white mt-1">
                {(insuranceDecision.riskScore * 100).toFixed(1)}%
              </p>
            </div>
          )}

          {insuranceDecision.premiumCalculated && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Premium Calculated</label>
              <p className="text-xs text-white mt-1">{formatCurrency(insuranceDecision.premiumCalculated)}</p>
            </div>
          )}
        </div>

        {/* Decision Outcome */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">Decision Outcome</h3>
          
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Outcome</label>
            <div className="mt-1">
              {getOutcomeBadge(insuranceDecision.decisionOutcome)}
            </div>
          </div>

          {insuranceDecision.decisionOutcomeReason && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Reason</label>
              <p className="text-xs text-white/80 mt-1">{insuranceDecision.decisionOutcomeReason}</p>
            </div>
          )}

          {insuranceDecision.underwritingDecision && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Underwriting Decision</label>
              <p className="text-xs text-white mt-1">{insuranceDecision.underwritingDecision}</p>
            </div>
          )}
        </div>

        {/* Impact Assessment */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">Impact Assessment</h3>
          
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-wider">Consumer Impact</label>
            <div className="mt-1">
              {getImpactBadge(insuranceDecision.decisionImpactConsumerImpact)}
            </div>
          </div>

          {insuranceDecision.decisionImpactFinancial && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Financial Impact</label>
              <p className="text-xs text-white mt-1">{formatCurrency(insuranceDecision.decisionImpactFinancial)}</p>
            </div>
          )}

          {insuranceDecision.decisionImpactAppealable !== null && (
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-wider">Appealable</label>
              <p className={`text-xs mt-1 text-white/80`}>
                {insuranceDecision.decisionImpactAppealable ? 'Yes' : 'No'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
