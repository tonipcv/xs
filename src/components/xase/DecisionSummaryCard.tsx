'use client';

import { Playfair_Display } from 'next/font/google';
const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface DecisionSummaryCardProps {
  record: any;
  insuranceDecision: any;
  docMode?: boolean;
}

export function DecisionSummaryCard({ record, insuranceDecision, docMode = false }: DecisionSummaryCardProps) {
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

  const isDoc = !!docMode;
  const wrapper = isDoc
    ? 'bg-white border border-gray-200 rounded-xl p-6 text-gray-900'
    : 'bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 text-white';

  return (
    <div className={`${wrapper} border-l-0`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className={`${heading.className} text-base font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'} mb-1`}>
            Decision Summary
          </h2>
          <p className={`text-xs ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
            Captured at decision time
          </p>
        </div>
        
        {/* Risk indicator */}
        {confidence !== null && impact && riskLevel !== 'low' && (
          <span className={`text-[10px] px-2 py-1 rounded border font-medium uppercase tracking-wide ${isDoc ? 'bg-gray-50 text-gray-700 border-gray-300' : 'bg-white/[0.06] text-white/70 border-white/20'}`}>
            {riskLevel} risk
          </span>
        )}
      </div>

      {/* Key Facts Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {/* Outcome */}
        <div>
          <label className={`text-[10px] uppercase tracking-wider font-medium mb-2 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
            Outcome
          </label>
          <div className="flex items-center gap-2">
            {outcome === 'APPROVED' && (
              <span className={`text-sm font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>Approved</span>
            )}
            {outcome === 'REJECTED' && (
              <span className={`text-sm font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>Rejected</span>
            )}
            {outcome === 'MANUAL_REVIEW' && (
              <span className={`text-sm font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>Review</span>
            )}
            {!outcome && (
              <span className={`text-sm font-semibold ${isDoc ? 'text-gray-400' : 'text-white/40'}`}>N/A</span>
            )}
          </div>
        </div>

        {/* Amount */}
        {insuranceDecision?.claimAmount && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-2 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Amount
            </label>
            <p className={`text-sm font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>
              {formatCurrency(insuranceDecision.claimAmount)}
            </p>
          </div>
        )}

        {/* Impact */}
        {impact && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-2 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Impact
            </label>
            <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${isDoc ? 'bg-gray-50 text-gray-700 border-gray-300' : 'bg-white/10 text-white/80 border-white/15'}`}>
              {impact}
            </span>
          </div>
        )}

        {/* Confidence */}
        {confidence !== null && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-2 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Confidence
            </label>
            <p className={`text-sm font-semibold ${isDoc ? 'text-gray-900' : confidence >= 0.7 ? 'text-white/90' : 'text-white/70'}`}>
              {(confidence * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Secondary Info */}
      <div className={`mt-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 ${isDoc ? 'border-t border-gray-200' : 'border-t border-white/[0.06]'}`}>
        {/* Model */}
        {record.modelId && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-1 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Model
            </label>
            <p className={`text-xs font-mono ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
              {record.modelId}
              {record.modelVersion && `@${record.modelVersion}`}
            </p>
          </div>
        )}

        {/* Timestamp */}
        <div>
          <label className={`text-[10px] uppercase tracking-wider font-medium mb-1 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
            Timestamp
          </label>
          <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
            {formatDate(record.timestamp)}
          </p>
        </div>

        {/* Claim Type */}
        {insuranceDecision?.claimType && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-1 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Claim Type
            </label>
            <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
              {insuranceDecision.claimType}
            </p>
          </div>
        )}

        {/* Claim Number */}
        {insuranceDecision?.claimNumber && (
          <div>
            <label className={`text-[10px] uppercase tracking-wider font-medium mb-1 block ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
              Claim Number
            </label>
            <p className={`text-xs font-mono ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
              {insuranceDecision.claimNumber}
            </p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className={`mt-6 pt-4 ${isDoc ? 'border-t border-gray-200' : 'border-t border-white/[0.06]'}`}>
        <p className={`text-[10px] ${isDoc ? 'text-gray-500' : 'text-white/25'}`}>
          Immutable record captured at decision time
        </p>
      </div>
    </div>
  );
}
