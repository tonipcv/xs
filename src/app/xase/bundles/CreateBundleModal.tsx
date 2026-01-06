'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface CreateBundleModalProps {
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialPurpose?: string;
  initialDescription?: string;
  title?: string;
}

export function CreateBundleModal({ onClose, onSuccess, tenantId, initialDateFrom, initialDateTo, initialPurpose, initialDescription, title }: CreateBundleModalProps) {
  const [purpose, setPurpose] = useState(initialPurpose || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [dateFrom, setDateFrom] = useState(initialDateFrom || '');
  const [dateTo, setDateTo] = useState(initialDateTo || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [currentBundleId, setCurrentBundleId] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

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
          packageTitle: title,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create bundle');
      }
      // Created successfully; present actions
      setCurrentBundleId(data.bundleId);
      setCreated(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create bundle');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBundle = async () => {
    if (!currentBundleId) return;
    setDownloading(true);
    setError('');
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;
      const dl = await fetch(`/api/xase/bundles/${currentBundleId}/download`, {
        method: 'POST',
        headers: {
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });
      if (!dl.ok) {
        const derr = await dl.json().catch(() => ({}));
        throw new Error(derr.error || `Download failed (${dl.status})`);
      }
      const blob = await dl.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-bundle-${currentBundleId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setDownloadReady(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to download bundle');
    } finally {
      setDownloading(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!currentBundleId) return;
    setDownloading(true);
    setError('');
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;
      const res = await fetch(`/api/xase/bundles/${currentBundleId}/pdf`, {
        method: 'POST',
        headers: {
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `PDF generation failed (${res.status})`);
      }
      const data = await res.json();
      const url = data?.presignedUrl || data?.pdfReportUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        throw new Error('No PDF URL returned');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1b1e] border border-white/[0.08] rounded-xl max-w-md w-full p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white/90">{title || 'Create Evidence Bundle'}</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Purpose (hidden if preset) */}
          {!initialPurpose && (
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">Purpose <span className="text-red-400">*</span></label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15] text-sm"
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
          )}

          {/* Advanced options */}
          <div className="border border-white/[0.08] rounded-md">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/70 hover:text-white/90"
            >
              Advanced options
              <span className="text-white/40">{showAdvanced ? '–' : '+'}</span>
            </button>
            {showAdvanced && (
              <div className="px-3 pb-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white placeholder-white/40 outline-none focus:border-white/[0.15] resize-none text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">From Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">To Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15] text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded p-2">{error}</div>
          )}

          {/* Actions / Progress */}
          {!created ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || downloading || (!purpose && !initialPurpose)}
                className="flex-1 px-3 py-2 bg-white text-black text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading || loading ? 'Generating…' : 'Generate'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadBundle}
                disabled={downloading}
                className="flex-1 px-3 py-2 bg-white text-black text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? 'Preparing…' : 'Download Evidence Bundle'}
              </button>
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={downloading}
                className="flex-1 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? 'Generating…' : 'Generate PDF Report'}
              </button>
            </div>
          )}

          {(loading || downloading) && (
            <div className="pt-2">
              <div className="w-full h-1 rounded bg-white/[0.06] overflow-hidden">
                <div className="h-full w-1/3 bg-white/40 animate-[progress_1.2s_ease-in-out_infinite]" />
              </div>
              <style jsx>{`
                @keyframes progress { 0% { transform: translateX(-100%);} 50% { transform: translateX(50%);} 100% { transform: translateX(200%);} }
              `}</style>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
