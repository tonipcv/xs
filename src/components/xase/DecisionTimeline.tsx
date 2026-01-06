'use client';

import { Clock, User, Bot, CheckCircle2, XCircle, AlertCircle, ArrowRight } from 'lucide-react';

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
}

export function DecisionTimeline({ record, interventions }: DecisionTimelineProps) {
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
      events.push({
        id: intervention.id,
        timestamp: new Date(intervention.timestamp),
        type: 'HUMAN_INTERVENTION',
        actor: {
          name: intervention.actorName || 'Unknown',
          email: intervention.actorEmail,
          role: intervention.actorRole,
        },
        action: intervention.action,
        details: intervention.reason || intervention.notes,
        metadata: intervention,
      });
    });

    // Sort by timestamp
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  const timeline = buildTimeline();

  const getEventIcon = (event: TimelineEvent) => {
    if (event.type === 'AI_DECISION') {
      return <Bot className="w-4 h-4 text-white/40" />;
    }
    
    if (event.type === 'HUMAN_INTERVENTION') {
      return <User className="w-4 h-4 text-white/40" />;
    }

    return <Clock className="w-4 h-4 text-white/30" />;
  };

  const getEventColor = (event: TimelineEvent) => {
    return 'border-white/[0.06] bg-white/[0.02]';
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
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-white/40" />
          <h2 className="text-sm font-medium text-white/90">Decision Timeline</h2>
          <span className="text-xs text-white/30">
            {timeline.length} event{timeline.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-xs text-white/25 mt-1">
          Immutable audit trail
        </p>
      </div>

      {/* Timeline */}
      <div className="p-6">
        {timeline.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/50 text-sm">No timeline events recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((event, index) => (
              <div key={event.id} className="relative">
                {/* Connector line */}
                {index < timeline.length - 1 && (
                  <div className="absolute left-[18px] top-10 bottom-0 w-[1px] bg-white/[0.06]" />
                )}

                {/* Event card */}
                <div className={`border rounded-lg p-4 ${getEventColor(event)}`}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                      {getEventIcon(event)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h3 className="text-sm font-medium text-white/90 mb-1">
                            {event.type === 'AI_DECISION' ? 'Automated Decision' : getActionLabel(event.action)}
                          </h3>
                          {event.type === 'HUMAN_INTERVENTION' && event.actor && (
                            <div className="space-y-0.5">
                              <p className="text-xs text-white/60">
                                {event.actor.name || 'Unknown Actor'}
                              </p>
                              {event.actor.role && (
                                <p className="text-[10px] text-white/40">
                                  {event.actor.role}
                                </p>
                              )}
                              {event.actor.email && (
                                <p className="text-[10px] text-white/30 font-mono">
                                  {event.actor.email}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-white/50 font-medium">
                            {formatTime(event.timestamp)}
                          </p>
                          <p className="text-[10px] text-white/30">
                            {formatDate(event.timestamp)}
                          </p>
                        </div>
                      </div>

                      {/* Details */}
                      {event.details && (
                        <div className="mt-2 p-3 bg-white/[0.02] rounded border border-white/[0.06]">
                          <p className="text-xs text-white/50">
                            {event.details}
                          </p>
                        </div>
                      )}

                      {/* Metadata badges */}
                      {event.type === 'AI_DECISION' && event.metadata && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {event.metadata.outcome && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-white/40 border border-white/[0.08]">
                              {event.metadata.outcome}
                            </span>
                          )}
                          {event.metadata.confidence !== null && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-white/40 border border-white/[0.08]">
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
      <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.01]">
        <p className="text-[10px] text-white/25">
          Cryptographically sealed audit trail
        </p>
      </div>
    </div>
  );
}
