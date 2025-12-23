'use client';

import { useState, useEffect } from 'react';
import { Download, FileText, Shield, Clock, Hash, CheckCircle2, AlertCircle, Copy, Link as LinkIcon, RotateCcw, UserCheck, Plus } from 'lucide-react';
import { InterventionDialog } from './InterventionDialog';

interface RecordDetailsProps {
  record: any;
  bundles: any[];
  checkpoint: any;
}

export function RecordDetails({ record, bundles, checkpoint }: RecordDetailsProps) {
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [interventionDialogOpen, setInterventionDialogOpen] = useState(false);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadInterventions = async () => {
    try {
      setLoadingInterventions(true);
      const res = await fetch(`/api/records/${record.transactionId}/intervene`);
      if (res.ok) {
        const data = await res.json();
        setInterventions(data.interventions || []);
      }
    } catch (e) {
      console.error('Failed to load interventions:', e);
    } finally {
      setLoadingInterventions(false);
    }
  };

  useEffect(() => {
    loadInterventions();
  }, [record.transactionId]);

  const handleInterventionSuccess = () => {
    showToast('success', 'Intervention added successfully');
    loadInterventions();
    // Reload page to update derived fields
    setTimeout(() => window.location.reload(), 1500);
  };

  const getActionBadge = (action: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      APPROVED: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Approved' },
      REJECTED: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' },
      OVERRIDE: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Override' },
      ESCALATED: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Escalated' },
      REVIEW_REQUESTED: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Review' },
    };
    const badge = badges[action] || { bg: 'bg-white/10', text: 'text-white', label: action };
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getFinalDecisionBadge = (source: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      AI: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'AI Decision' },
      HUMAN_APPROVED: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Human Approved' },
      HUMAN_REJECTED: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Human Rejected' },
      HUMAN_OVERRIDE: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Human Override' },
    };
    const badge = badges[source] || { bg: 'bg-white/10', text: 'text-white', label: source };
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };
  const [downloadType, setDownloadType] = useState<'full' | 'hashes'>('full');

  const handleDownload = async (includePayloads: boolean) => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        include_payloads: includePayloads.toString(),
        mode: 'redirect',
      });
      
      window.location.href = `/api/records/${record.transactionId}/evidence?${params}`;
      showToast('info', 'Starting download...');
    } catch (error) {
      console.error('Download failed:', error);
      showToast('error', 'Download failed. Try again.');
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  };

  const handleRowRedownload = async (includesPayloads: boolean) => {
    try {
      const params = new URLSearchParams({
        include_payloads: includesPayloads.toString(),
        mode: 'redirect',
      });
      window.location.href = `/api/records/${record.transactionId}/evidence?${params}`;
      showToast('info', 'Starting bundle download...');
    } catch (e) {
      showToast('error', 'Could not start the download.');
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', `${label} copied.`);
    } catch (e) {
      showToast('error', `Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const handleCopyPresignedUrl = async (includesPayloads: boolean) => {
    try {
      const params = new URLSearchParams({
        include_payloads: includesPayloads.toString(),
        mode: 'json',
      });
      const res = await fetch(`/api/records/${record.transactionId}/evidence?${params}`, { method: 'GET' });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      if (!data?.presigned_url) throw new Error('no url');
      await copyToClipboard(data.presigned_url, 'Signed URL');
    } catch (e) {
      showToast('error', 'Failed to get signed URL.');
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1d20]">
      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-md text-sm shadow-md border ${
              toast.type === 'success'
                ? 'bg-green-500/10 text-green-300 border-green-500/20'
                : toast.type === 'error'
                ? 'bg-red-500/10 text-red-300 border-red-500/20'
                : 'bg-white/10 text-white border-white/20'
            }`}
          >
            {toast.message}
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <a
                href="/xase/records"
                className="text-white/50 hover:text-white transition-colors text-sm"
              >
                ← Records
              </a>
              <span className="text-white/30">/</span>
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Record Details
              </h1>
            </div>
            <p className="text-sm text-white/50 font-mono">
              {record.transactionId}
            </p>
          </div>

          {/* Download Actions */}
          <div className="flex items-center gap-3">
            <select
              value={downloadType}
              onChange={(e) => setDownloadType(e.target.value as 'full' | 'hashes')}
              className="px-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="full">Full Bundle (with payloads)</option>
              <option value="hashes">Hashes Only</option>
            </select>
            
            <button
              onClick={() => handleDownload(downloadType === 'full')}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download Evidence'}
            </button>
          </div>
        </div>

        {/* Record Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Main Info */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white/50" />
              <h2 className="text-lg font-semibold text-white">Decision Info</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Transaction ID</label>
                <p className="text-sm text-white font-mono mt-1">{record.transactionId}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Policy ID</label>
                  <p className="text-sm text-white mt-1">{record.policyId || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Policy Version</label>
                  <p className="text-sm text-white mt-1">{record.policyVersion || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Decision Type</label>
                  <p className="text-sm text-white mt-1">{record.decisionType || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Confidence</label>
                  <p className="text-sm text-white mt-1">
                    {record.confidence ? (record.confidence * 100).toFixed(1) + '%' : 'N/A'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Timestamp</label>
                <p className="text-sm text-white mt-1">
                  {new Date(record.timestamp).toLocaleString('en-US', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              </div>

              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Status</label>
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded ${
                      record.isVerified
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-yellow-500/10 text-yellow-400'
                    }`}
                  >
                    {record.isVerified ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    {record.isVerified ? 'Verified' : 'Pending'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Final Decision Source</label>
                <div className="mt-2">
                  {getFinalDecisionBadge(record.finalDecisionSource || 'AI')}
                </div>
              </div>
            </div>
          </div>

          {/* Hashes & Chain */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Hash className="w-5 h-5 text-white/50" />
              <h2 className="text-lg font-semibold text-white">Cryptographic Proof</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Record Hash</label>
                <p className="text-xs text-white/70 font-mono mt-1 break-all">{record.recordHash}</p>
              </div>

              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Input Hash</label>
                <p className="text-xs text-white/70 font-mono mt-1 break-all">{record.inputHash}</p>
              </div>

              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Output Hash</label>
                <p className="text-xs text-white/70 font-mono mt-1 break-all">{record.outputHash}</p>
              </div>

              {record.contextHash && (
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Context Hash</label>
                  <p className="text-xs text-white/70 font-mono mt-1 break-all">{record.contextHash}</p>
                </div>
              )}

              {record.previousHash && (
                <div>
                  <label className="text-xs text-white/50 uppercase tracking-wider">Previous Hash</label>
                  <p className="text-xs text-white/70 font-mono mt-1 break-all">{record.previousHash}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Checkpoint Info */}
        {checkpoint && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-white/50" />
              <h2 className="text-lg font-semibold text-white">Nearest Checkpoint</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Checkpoint ID</label>
                <p className="text-sm text-white font-mono mt-1">{checkpoint.checkpointId}</p>
              </div>
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Timestamp</label>
                <p className="text-sm text-white mt-1">
                  {new Date(checkpoint.timestamp).toLocaleString('en-US')}
                </p>
              </div>
              <div>
                <label className="text-xs text-white/50 uppercase tracking-wider">Key ID</label>
                <p className="text-sm text-white/70 font-mono mt-1">{checkpoint.keyId || 'N/A'}</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider">Checkpoint Hash</label>
              <p className="text-xs text-white/70 font-mono mt-1 break-all">N/A</p>
            </div>
          </div>
        )}

        {/* Human Interventions */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-white/50" />
              <h2 className="text-lg font-semibold text-white">Human Interventions</h2>
              {interventions.length > 0 && (
                <span className="text-xs text-white/50">({interventions.length})</span>
              )}
            </div>
            <button
              onClick={() => setInterventionDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Intervention
            </button>
          </div>

          {loadingInterventions ? (
            <div className="px-6 py-12 text-center">
              <p className="text-white/50 text-sm">Loading interventions...</p>
            </div>
          ) : interventions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 tracking-wider">ACTION</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 tracking-wider">ACTOR</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 tracking-wider">REASON</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 tracking-wider">TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((intervention) => (
                    <tr key={intervention.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">{getActionBadge(intervention.action)}</td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-white">{intervention.actor?.name || 'Unknown'}</p>
                          <p className="text-xs text-white/50 font-mono">{intervention.actor?.email || ''}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-white/80 max-w-md">{intervention.reason || '—'}</p>
                        {intervention.notes && (
                          <p className="text-xs text-white/50 mt-1">{intervention.notes}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {new Date(intervention.timestamp).toLocaleString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-white/60 text-sm">No human interventions recorded yet.</p>
              <p className="text-white/30 text-xs">Click "Add Intervention" to register a review, approval, or override.</p>
            </div>
          )}
        </div>

        {/* Evidence Bundles History */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-white/50" />
              <h2 className="text-lg font-semibold text-white">Evidence Bundles</h2>
              <span className="text-xs text-white/50">({bundles.length})</span>
            </div>
          </div>

          {bundles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Bundle ID
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Hash
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Last Access
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => (
                    <tr
                      key={bundle.id}
                      className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4 text-xs text-white font-mono">
                        {bundle.bundleId.substring(0, 20)}...
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            bundle.includesPayloads
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-purple-500/10 text-purple-400'
                          }`}
                        >
                          {bundle.includesPayloads ? 'Full' : 'Hashes'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {bundle.bundleSize ? (bundle.bundleSize / 1024).toFixed(1) + ' KB' : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-xs text-white/70 font-mono">
                        {bundle.bundleHash.substring(0, 16)}...
                      </td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {new Date(bundle.createdAt).toLocaleString('en-US', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/80">
                        {bundle.lastAccess
                          ? new Date(bundle.lastAccess).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            title="Re-download"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                            onClick={() => handleRowRedownload(!!bundle.includesPayloads)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Re-download
                          </button>
                          <button
                            title="Copy hash"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                            onClick={() => copyToClipboard(bundle.bundleHash, 'Hash')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy hash
                          </button>
                          <button
                            title="Copy presigned URL"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                            onClick={() => handleCopyPresignedUrl(!!bundle.includesPayloads)}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            Copy URL
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-white/60 text-sm">No evidence bundle generated yet.</p>
              <p className="text-white/30 text-xs">Click below to generate the first bundle.</p>
              <div>
                <button
                  onClick={() => handleDownload(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Generate and download bundle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Intervention Dialog */}
        <InterventionDialog
          transactionId={record.transactionId}
          isOpen={interventionDialogOpen}
          onClose={() => setInterventionDialogOpen(false)}
          onSuccess={handleInterventionSuccess}
        />
      </div>
    </div>
  );
}
