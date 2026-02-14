'use client';

import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'AI_DECISION' | 'HUMAN_INTERVENTION' | 'SYSTEM_EVENT';
  actor?: {
    name?: string;
    email?: string;
    role?: string;
  };
  action: string;
  details?: string;
  metadata?: any;
}

interface DecisionTimelineProps {
  record: any;
  interventions: any[];
  docMode?: boolean;
}

export function DecisionTimeline({ record, interventions, docMode = false }: DecisionTimelineProps) {
  const buildTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    // 1. AI Decision (initial)
    events.push({
      id: 'ai-decision',
      timestamp: new Date(record.timestamp),
      type: 'AI_DECISION',
      action: record.insuranceDecision?.decisionOutcome || 'DECISION_MADE',
      details: `Model ${record.modelId || 'AI'}${record.modelVersion ? `@${record.modelVersion}` : ''} made automated decision`,
      metadata: {
        confidence: record.confidence,
        outcome: record.insuranceDecision?.decisionOutcome,
      },
    });

    // 2. Human Interventions
    interventions.forEach((intervention) => {
      const email = (intervention?.actor && intervention.actor.email)
        || intervention?.actorEmail
        || undefined;
      const name = (intervention?.actor && intervention.actor.name)
        || intervention?.actorName
        || email
        || 'Unknown';
      const role = (intervention?.actor && intervention.actor.role)
        || intervention?.actorRole
        || undefined;

      events.push({
        id: intervention.id,
        timestamp: new Date(intervention.timestamp),
        type: 'HUMAN_INTERVENTION',
        actor: { name, email, role },
        action: intervention.action,
        details: intervention.reason || intervention.notes,
        metadata: intervention,
      });
    });

    // Sort by timestamp
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  const timeline = buildTimeline();

  const isDoc = !!docMode;

  const getEventIcon = (_event: TimelineEvent) => null;

  const getEventColor = (event: TimelineEvent) => {
    return isDoc ? 'border-gray-200 bg-gray-50' : 'border-white/[0.06] bg-white/[0.02]';
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'APPROVED': 'Approved Decision',
      'REJECTED': 'Rejected Decision',
      'OVERRIDE': 'Overrode Decision',
      'REVIEW_REQUESTED': 'Requested Review',
      'ESCALATED': 'Escalated Decision',
    };
    return labels[action] || action.replace(/_/g, ' ');
  };

  return (
    <div className={`${isDoc ? 'bg-white border border-gray-200 text-gray-900' : 'bg-white/[0.02] border border-white/[0.06] text-white'} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isDoc ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div className="flex items-center gap-3">
          <h2 className={`${heading.className} text-base font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>Decision Timeline</h2>
          <span className={`text-xs ${isDoc ? 'text-gray-500' : 'text-white/30'}`}>
            {timeline.length} event{timeline.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className={`text-xs mt-1 ${isDoc ? 'text-gray-600' : 'text-white/25'}`}>
          Immutable audit trail
        </p>
      </div>

      {/* Timeline */}
      <div className="p-6">
        {timeline.length === 0 ? (
          <div className="text-center py-12">
            <p className={`${isDoc ? 'text-gray-700' : 'text-white/50'} text-sm`}>No timeline events recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((event, index) => (
              <div key={event.id} className="relative">
                {/* Connector line */}
                {index < timeline.length - 1 && (
                  <div className={`absolute left-0 top-6 bottom-0 w-[1px] ${isDoc ? 'bg-gray-200' : 'bg-white/[0.06]'}`} />
                )}

                {/* Event card */}
                <div className={`border rounded-xl p-4 ${getEventColor(event)}`}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    {/* icon removed for neutral UI */}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h3 className={`text-sm font-medium mb-1 ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>
                            {event.type === 'AI_DECISION' ? 'Automated Decision' : getActionLabel(event.action)}
                          </h3>
                          {event.type === 'HUMAN_INTERVENTION' && event.actor && (
                            <div className="space-y-0.5">
                              <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/60'}`}>
                                {event.actor.name || 'Unknown Actor'}
                              </p>
                              {event.actor.role && (
                                <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/40'}`}>
                                  {event.actor.role}
                                </p>
                              )}
                              {event.actor.email && (
                                <p className={`text-[10px] font-mono ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                                  {event.actor.email}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-medium ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                            {formatTime(event.timestamp)}
                          </p>
                          <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                            {formatDate(event.timestamp)}
                          </p>
                        </div>
                      </div>

                      {/* Details */}
                      {event.details && (
                        <div className={`mt-2 p-3 rounded border ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                          <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                            {event.details}
                          </p>
                        </div>
                      )}

                      {/* Metadata badges */}
                      {event.type === 'AI_DECISION' && event.metadata && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {event.metadata.outcome && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${isDoc ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-white/[0.04] text-white/40 border-white/[0.08]'}`}>
                              {event.metadata.outcome}
                            </span>
                          )}
                          {event.metadata.confidence !== null && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${isDoc ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-white/[0.04] text-white/40 border-white/[0.08]'}`}>
                              {(event.metadata.confidence * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className={`px-6 py-3 border-t ${isDoc ? 'border-gray-200 bg-white' : 'border-white/[0.06] bg-white/[0.01]'}`}>
        <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/25'}`}>
          Cryptographically sealed audit trail
        </p>
      </div>
    </div>
  );
}
