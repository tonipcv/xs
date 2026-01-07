'use client';

import { useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface InterventionDialogProps {
  transactionId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type InterventionAction = 'APPROVED' | 'REJECTED' | 'OVERRIDE' | 'ESCALATED' | 'REVIEW_REQUESTED';

export function InterventionDialog({
  transactionId,
  isOpen,
  onClose,
  onSuccess,
}: InterventionDialogProps) {
  const [action, setAction] = useState<InterventionAction>('APPROVED');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [newOutcome, setNewOutcome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresReason = ['REJECTED', 'OVERRIDE'].includes(action);
  const requiresNewOutcome = action === 'OVERRIDE';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validações client-side
    if (requiresReason && !reason.trim()) {
      setError('Reason is required for this action');
      return;
    }

    if (requiresNewOutcome && !newOutcome.trim()) {
      setError('New outcome is required for OVERRIDE action');
      return;
    }

    // Validar JSON se OVERRIDE
    let parsedOutcome: any = undefined;
    if (requiresNewOutcome) {
      try {
        parsedOutcome = JSON.parse(newOutcome);
      } catch {
        setError('Invalid JSON in new outcome');
        return;
      }
    }

    setLoading(true);

    try {
      const payload: Record<string, any> = {
        action,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (requiresNewOutcome) {
        payload.newOutcome = parsedOutcome;
      }
      const res = await fetch(`/api/records/${transactionId}/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Try parse JSON, but don't fail UI if body is empty
      let data: any = null;
      try { data = await res.json(); } catch {}

      if (res.status === 403) {
        setError(data?.error || 'Insufficient role to create intervention. Contact an administrator.');
        return;
      }

      if (!res.ok) {
        const details = Array.isArray(data?.details)
          ? `: ${data.details.map((d: any) => d?.message || '').filter(Boolean).join(' | ')}`
          : '';
        throw new Error((data?.error || 'Failed to create intervention') + details);
      }

      // Sucesso
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAction('APPROVED');
    setReason('');
    setNotes('');
    setNewOutcome('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-white">Add Human Intervention</h2>
            <p className="text-xs text-white/50 mt-1 font-mono">{transactionId}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-white/[0.04] border border-white/[0.08] rounded-lg">
              <AlertCircle className="w-4 h-4 text-white/50 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-white/80">{error}</p>
              </div>
            </div>
          )}

          {/* Action Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-white">
              Action <span className="text-white/50">*</span>
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as InterventionAction)}
              className="w-full px-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.08] rounded-full text-white focus:outline-none focus:ring-2 focus:ring-white/20"
              disabled={loading}
            >
              <option value="APPROVED">Approved - Confirm AI decision</option>
              <option value="REJECTED">Rejected - Reject AI decision</option>
              <option value="OVERRIDE">Override - Change AI decision</option>
              <option value="ESCALATED">Escalated - Send to higher level</option>
              <option value="REVIEW_REQUESTED">Review Requested - Mark for review</option>
            </select>
            <p className="text-xs text-white/40">
              {action === 'APPROVED' && 'Confirm that the AI decision is correct'}
              {action === 'REJECTED' && 'Reject the AI decision (reason required)'}
              {action === 'OVERRIDE' && 'Change the AI decision to a new outcome (reason + outcome required)'}
              {action === 'ESCALATED' && 'Escalate decision to a higher authority'}
              {action === 'REVIEW_REQUESTED' && 'Mark decision for human review'}
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-white">
              Reason {requiresReason && <span className="text-white/50">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you are taking this action..."
              rows={3}
              className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              disabled={loading}
              required={requiresReason}
            />
            <p className="text-[11px] text-white/40">
              {requiresReason ? 'Required for this action' : 'Optional justification'}
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-white">Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context or observations..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              disabled={loading}
            />
          </div>

          {/* New Outcome (only for OVERRIDE) */}
          {requiresNewOutcome && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-white">
                New Outcome (JSON) <span className="text-white/50">*</span>
              </label>
              <textarea
                value={newOutcome}
                onChange={(e) => setNewOutcome(e.target.value)}
                placeholder='{"decision": "APPROVED", "reason": "Manual override"}'
                rows={6}
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none font-mono text-xs"
                disabled={loading}
                required
              />
              <p className="text-[11px] text-white/40">
                Provide the new decision outcome in JSON format
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.06] rounded-full transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-white text-black rounded-full text-xs font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Submit Intervention
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
