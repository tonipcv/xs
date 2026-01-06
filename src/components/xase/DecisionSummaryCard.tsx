'use client';

interface DecisionSummaryCardProps {
  record: any;
  insuranceDecision: any;
}

export function DecisionSummaryCard({ record, insuranceDecision }: DecisionSummaryCardProps) {
  const getOutcomeColor = (outcome: string | null) => {
    if (outcome === 'APPROVED') return 'border-l-emerald-500/30';
    if (outcome === 'REJECTED') return 'border-l-rose-500/30';
    return 'border-l-amber-500/30';
  };

  const getRiskLevel = () => {
    const confidence = record.confidence || 0;
    const impact = insuranceDecision?.decisionImpactConsumerImpact;
    
    if (confidence < 0.7 && impact === 'HIGH') return 'high';
    if (confidence < 0.7 || impact === 'HIGH') return 'medium';
    return 'low';
  };

  const formatCurrency = (amount: any) => {
    if (!amount) return 'N/A';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `£${num.toLocaleString('en-GB')}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  const outcome = insuranceDecision?.decisionOutcome;
  const impact = insuranceDecision?.decisionImpactConsumerImpact;
  const confidence = record.confidence;

  const riskLevel = getRiskLevel();

  return (
    <div className={`border-l-2 ${getOutcomeColor(outcome)} bg-white/[0.02] border border-white/[0.06] rounded-lg p-6`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-sm font-medium text-white/90 mb-1">
            Decision Summary
          </h2>
          <p className="text-xs text-white/30">
            Captured at decision time
          </p>
        </div>
        
        {/* Risk indicator */}
        {confidence !== null && impact && riskLevel !== 'low' && (
          <span className={`text-[10px] px-2 py-1 rounded border font-medium uppercase tracking-wide ${
            riskLevel === 'high' 
              ? 'bg-rose-500/5 text-rose-400/90 border-rose-500/20' 
              : 'bg-amber-500/5 text-amber-400/90 border-amber-500/20'
          }`}>
            {riskLevel} risk
          </span>
        )}
      </div>

      {/* Key Facts Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {/* Outcome */}
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2 block">
            Outcome
          </label>
          <div className="flex items-center gap-2">
            {outcome === 'APPROVED' && (
              <span className="text-sm font-semibold text-emerald-400">Approved</span>
            )}
            {outcome === 'REJECTED' && (
              <span className="text-sm font-semibold text-rose-400">Rejected</span>
            )}
            {outcome === 'MANUAL_REVIEW' && (
              <span className="text-sm font-semibold text-amber-400">Review</span>
            )}
            {!outcome && (
              <span className="text-sm font-semibold text-white/40">N/A</span>
            )}
          </div>
        </div>

        {/* Amount */}
        {insuranceDecision?.claimAmount && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2 block">
              Amount
            </label>
            <p className="text-sm font-semibold text-white/90">
              {formatCurrency(insuranceDecision.claimAmount)}
            </p>
          </div>
        )}

        {/* Impact */}
        {impact && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2 block">
              Impact
            </label>
            <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
              impact === 'HIGH' ? 'bg-rose-500/5 text-rose-400/80 border-rose-500/20' :
              impact === 'MEDIUM' ? 'bg-amber-500/5 text-amber-400/80 border-amber-500/20' :
              'bg-emerald-500/5 text-emerald-400/80 border-emerald-500/20'
            }`}>
              {impact}
            </span>
          </div>
        )}

        {/* Confidence */}
        {confidence !== null && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2 block">
              Confidence
            </label>
            <p className={`text-sm font-semibold ${
              confidence >= 0.7 ? 'text-white/90' : 'text-amber-400/90'
            }`}>
              {(confidence * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Secondary Info */}
      <div className="mt-6 pt-6 border-t border-white/[0.06] grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model */}
        {record.modelId && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1 block">
              Model
            </label>
            <p className="text-xs text-white/60 font-mono">
              {record.modelId}
              {record.modelVersion && `@${record.modelVersion}`}
            </p>
          </div>
        )}

        {/* Timestamp */}
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1 block">
            Timestamp
          </label>
          <p className="text-xs text-white/60">
            {formatDate(record.timestamp)}
          </p>
        </div>

        {/* Claim Type */}
        {insuranceDecision?.claimType && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1 block">
              Claim Type
            </label>
            <p className="text-xs text-white/60">
              {insuranceDecision.claimType}
            </p>
          </div>
        )}

        {/* Claim Number */}
        {insuranceDecision?.claimNumber && (
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-1 block">
              Claim Number
            </label>
            <p className="text-xs text-white/60 font-mono">
              {insuranceDecision.claimNumber}
            </p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-6 pt-4 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/25">
          Immutable record captured at decision time
        </p>
      </div>
    </div>
  );
}
