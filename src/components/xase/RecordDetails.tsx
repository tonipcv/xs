'use client';

import { useState, useEffect } from 'react';
import { Download, FileText, Shield, Clock, Hash, CheckCircle2, AlertCircle, Copy, Link as LinkIcon, RotateCcw, UserCheck, Plus } from 'lucide-react';
import { InterventionDialog } from './InterventionDialog';
import { InsuranceDetailsCard } from './InsuranceDetailsCard';
import { SnapshotsCard } from './SnapshotsCard';
import { DecisionSummaryCard } from './DecisionSummaryCard';
import { DecisionTimeline } from './DecisionTimeline';
import { ProofIntegrityPanel } from './ProofIntegrityPanel';
import { AuditPackageWizard } from './AuditPackageWizard';
import { RegulatorViewToggle } from './RegulatorViewToggle';

interface RecordDetailsProps {
  record: any;
  bundles: any[];
  checkpoint: any;
  snapshots?: any[];
}

export function RecordDetails({ record, bundles, checkpoint, snapshots = [] }: RecordDetailsProps) {
  const [downloading, setDownloading] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundleUrl, setBundleUrl] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [interventionDialogOpen, setInterventionDialogOpen] = useState(false);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);
  const [regulatorView, setRegulatorView] = useState(false);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleGeneratePdf = async () => {
    setPdfModalOpen(true);
    setPdfBusy(true);
    setPdfError(null);
    if (pdfUrl) {
      try { URL.revokeObjectURL(pdfUrl); } catch {}
      setPdfUrl(null);
    }
    try {
      const res = await fetch(`/api/records/${record.transactionId}/pdf`, { method: 'GET' });
      if (!res.ok) {
        let msg = 'Failed to generate PDF';
        try { const j = await res.json(); msg = j?.message || j?.error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      showToast('success', 'PDF is ready');
    } catch (e: any) {
      setPdfError(e?.message || 'Failed to generate PDF');
      showToast('error', 'PDF generation failed. Try again.');
    } finally {
      setPdfBusy(false);
    }
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
    // Neutral badge matching SnapshotsCard style
    const badge = { bg: 'bg-white/10', text: 'text-white/80', label: action };
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-white/15 ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getFinalDecisionBadge = (source: string) => {
    // Neutral badge matching SnapshotsCard style
    const badge = { bg: 'bg-white/10', text: 'text-white/80', label: source };
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-white/15 ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };
  const [downloadType, setDownloadType] = useState<'full' | 'hashes'>('full');

  const handleDownload = async (includePayloads: boolean) => {
    setBundleModalOpen(true);
    setBundleBusy(true);
    setBundleError(null);
    setBundleUrl(null);
    try {
      const params = new URLSearchParams({
        include_payloads: includePayloads.toString(),
        mode: 'json',
      });
      const res = await fetch(`/api/records/${record.transactionId}/evidence?${params}`, { method: 'GET' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to generate');
      }
      if (data?.presigned_url) {
        setBundleUrl(data.presigned_url);
        showToast('success', 'Evidence bundle is ready');
      } else {
        throw new Error('No URL returned');
      }
    } catch (error: any) {
      setBundleError(error?.message || 'Failed to generate');
      showToast('error', 'Download failed. Try again.');
    } finally {
      setBundleBusy(false);
      setDownloading(false);
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
    <div className="min-h-screen bg-[#121316]">
      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-md text-sm shadow-md border bg-white/10 text-white border-white/20`}
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
                ← {regulatorView ? 'Decision Records' : 'Decision Risk Inbox'}
              </a>
              <span className="text-white/30">/</span>
              <h1 className="text-xl font-semibold text-white tracking-tight">
                {regulatorView ? 'Decision Record' : 'Decision Investigation'}
              </h1>
            </div>
            <p className="text-sm text-white/50 font-mono">
              {record.transactionId}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <RegulatorViewToggle 
              enabled={regulatorView}
              onChange={setRegulatorView}
            />
            {!regulatorView && (
              <AuditPackageWizard 
                transactionId={record.transactionId}
                onComplete={(bundleId) => {
                  showToast('success', 'Audit package created successfully');
                  setTimeout(() => window.location.reload(), 1500);
                }}
              />
            )}
          </div>
        </div>

        {/* Decision Summary Card - IMMUTABLE */}
        <DecisionSummaryCard 
          record={record}
          insuranceDecision={record.insuranceDecision}
        />

        {/* Proof & Integrity Panel */}
        <ProofIntegrityPanel record={record} />

        {/* Insurance Details */}
        {record.insuranceDecision && (
          <InsuranceDetailsCard insuranceDecision={record.insuranceDecision} />
        )}

        {/* Reproducibility Snapshots */}
        {snapshots.length > 0 && (
          <SnapshotsCard snapshots={snapshots} />
        )}

        {/* Checkpoint Info */}
        {checkpoint && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-white/50" />
              <h2 className="text-base font-semibold text-white">Nearest Checkpoint</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-white/50 uppercase tracking-wider">Checkpoint ID</label>
                <p className="text-xs text-white font-mono mt-1">{checkpoint.checkpointId}</p>
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase tracking-wider">Timestamp</label>
                <p className="text-xs text-white mt-1">
                  {new Date(checkpoint.timestamp).toLocaleString('en-US')}
                </p>
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase tracking-wider">Key ID</label>
                <p className="text-xs text-white/70 font-mono mt-1">{checkpoint.keyId || 'N/A'}</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-white/50 uppercase tracking-wider">Checkpoint Hash</label>
              <p className="text-[11px] text-white/70 font-mono mt-1 break-all">N/A</p>
            </div>
          </div>
        )}

        {/* Decision Timeline - Accountability */}
        {!loadingInterventions && (
          <DecisionTimeline 
            record={record}
            interventions={interventions}
          />
        )}

        {/* Add Intervention Button - Hidden in Regulator View */}
        {!regulatorView && (
          <div className="flex justify-end">
            <button
              onClick={() => setInterventionDialogOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded text-xs font-medium hover:bg-white/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Human Intervention
            </button>
          </div>
        )}

        {/* Evidence Bundles History */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-white/40" />
              <h2 className="text-sm font-medium text-white/90">Evidence Bundles</h2>
              <span className="text-xs text-white/30">{bundles.length}</span>
            </div>
            {bundles.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-white/12 bg-transparent text-white/85 rounded text-xs font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Generate bundle
                </button>
                <button
                  onClick={handleGeneratePdf}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-white/12 bg-transparent text-white/85 rounded text-xs font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors"
                >
                  Generate PDF
                </button>
              </div>
            )}
          </div>

          {bundles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Bundle ID</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Size</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Hash</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Created</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Last Access</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-white/30 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.map((bundle) => (
                    <tr
                      key={bundle.id}
                      className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4 text-xs text-white/80 font-mono">
                        {bundle.bundleId.substring(0, 20)}...
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] px-2 py-0.5 rounded border bg-white/[0.02] text-white/50 border-white/[0.06]">
                          {bundle.includesPayloads ? 'Full' : 'Hashes'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-white/60">
                        {bundle.bundleSize ? (bundle.bundleSize / 1024).toFixed(1) + ' KB' : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-xs text-white/50 font-mono">
                        {bundle.bundleHash ? `${bundle.bundleHash.substring(0, 16)}...` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/60">
                        {bundle.createdAt
                          ? new Date(bundle.createdAt).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/60">
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
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-white/[0.02] text-white/60 border-white/[0.06] hover:bg-white/[0.06]"
                            onClick={() => handleRowRedownload(!!bundle.includesPayloads)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Re-download
                          </button>
                          <button
                            title="Copy hash"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-white/[0.02] text-white/60 border-white/[0.06] hover:bg-white/[0.06]"
                            onClick={() => copyToClipboard(bundle.bundleHash, 'Hash')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy hash
                          </button>
                          <button
                            title="Copy presigned URL"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-white/[0.02] text-white/60 border-white/[0.06] hover:bg-white/[0.06]"
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-white/12 bg-transparent text-white/85 rounded text-xs font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Generate bundle
                </button>
                <button
                  onClick={handleGeneratePdf}
                  className="ml-2 inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white rounded text-xs font-medium hover:bg-white/15 transition-colors"
                >
                  Generate PDF
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
      {bundleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#0f1114] border border-white/[0.08] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white/90">Evidence generation</h3>
              <button
                onClick={() => setBundleModalOpen(false)}
                className="text-white/60 hover:text-white/80 text-sm"
                disabled={bundleBusy}
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-white/80">
                <span>Generating bundle</span>
                {bundleBusy && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/15 border-t-white animate-spin inline-block" />}
                {!bundleBusy && !bundleError && bundleUrl && <span className="text-emerald-400/80">Done</span>}
                {bundleError && <span className="text-rose-400/80">Failed</span>}
              </div>
              {bundleBusy && (
                <div className="w-full h-1 rounded bg-white/[0.06] overflow-hidden">
                  <div className="h-full w-1/3 bg-white/40 animate-[progress_1.2s_ease-in-out_infinite]" />
                </div>
              )}
              <style jsx>{`
                @keyframes progress {
                  0% { transform: translateX(-100%); }
                  50% { transform: translateX(50%); }
                  100% { transform: translateX(200%); }
                }
              `}</style>
            </div>
            {bundleError && (
              <div className="text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded p-2">{bundleError}</div>
            )}
            {bundleUrl ? (
              <a
                href={bundleUrl}
                className="inline-flex items-center justify-center w-full px-3 py-2 bg-white text-black rounded text-sm font-medium hover:bg-white/90 transition-colors"
                onClick={() => setBundleModalOpen(false)}
              >
                Download evidence
              </a>
            ) : (
              <button
                className="inline-flex items-center justify-center w-full px-3 py-2 bg-white/10 text-white/70 rounded text-sm font-medium"
                disabled
              >
                Preparing…
              </button>
            )}
          </div>
        </div>
      )}
      {pdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#0f1114] border border-white/[0.08] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white/90">PDF generation</h3>
              <button
                onClick={() => setPdfModalOpen(false)}
                className="text-white/60 hover:text-white/80 text-sm"
                disabled={pdfBusy}
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-white/80">
                <span>Generating PDF</span>
                {pdfBusy && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/15 border-t-white animate-spin inline-block" />}
                {!pdfBusy && !pdfError && pdfUrl && <span className="text-emerald-400/80">Done</span>}
                {pdfError && <span className="text-rose-400/80">Failed</span>}
              </div>
              {pdfBusy && (
                <div className="w-full h-1 rounded bg-white/[0.06] overflow-hidden">
                  <div className="h-full w-1/3 bg-white/40 animate-[progress_1.2s_ease-in-out_infinite]" />
                </div>
              )}
            </div>
            {pdfError && (
              <div className="text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded p-2">{pdfError}</div>
            )}
            {pdfUrl ? (
              <a
                href={pdfUrl}
                download={`decision-evidence-summary-${record.transactionId}.pdf`}
                className="inline-flex items-center justify-center w-full px-3 py-2 bg-white text-black rounded text-sm font-medium hover:bg-white/90 transition-colors"
                onClick={() => setPdfModalOpen(false)}
              >
                Download PDF
              </a>
            ) : (
              <button
                className="inline-flex items-center justify-center w-full px-3 py-2 bg-white/10 text-white/70 rounded text-sm font-medium"
                disabled
              >
                Preparing…
              </button>
            )}
            <style jsx>{`
              @keyframes progress {
                0% { transform: translateX(-100%); }
                50% { transform: translateX(50%); }
                100% { transform: translateX(200%); }
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}
