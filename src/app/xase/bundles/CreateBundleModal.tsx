'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface CreateBundleModalProps {
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function CreateBundleModal({ onClose, onSuccess, tenantId, initialDateFrom, initialDateTo }: CreateBundleModalProps) {
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [dateFrom, setDateFrom] = useState(initialDateFrom || '');
  const [dateTo, setDateTo] = useState(initialDateTo || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;
      const res = await fetch('/api/xase/bundles/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          purpose,
          description,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create bundle');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create bundle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1b1e] border border-white/[0.08] rounded-xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create Evidence Bundle</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Purpose <span className="text-red-400">*</span>
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15]"
            >
              <option value="">Select purpose...</option>
              <option value="AUDIT">External Audit</option>
              <option value="COMPLIANCE">Compliance Review</option>
              <option value="LEGAL">Legal Request</option>
              <option value="INVESTIGATION">Internal Investigation</option>
              <option value="BACKUP">Backup / Archive</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: Add context for this bundle (e.g., 'Q4 2024 SOC2 audit evidence')"
              rows={3}
              className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white placeholder-white/40 outline-none focus:border-white/[0.15] resize-none"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15]"
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-300/80">
              <strong>Note:</strong> Bundle generation is asynchronous and may take several minutes depending on the number of records. 
              You'll be able to download the bundle once it's ready. All downloads are audited for compliance.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !purpose}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Bundle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
