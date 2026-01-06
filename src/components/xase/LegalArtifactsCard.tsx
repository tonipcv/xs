'use client';

import { FileText, Shield, Scale, Download } from 'lucide-react';
import { useState } from 'react';

interface LegalArtifactsCardProps {
  bundleId: string;
  pdfReportUrl: string | null;
  pdfReportHash: string | null;
  bundleManifestHash: string | null;
  legalFormat: string | null;
}

export function LegalArtifactsCard({
  bundleId,
  pdfReportUrl,
  pdfReportHash,
  bundleManifestHash,
  legalFormat,
}: LegalArtifactsCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadCustody = async (format: 'json' | 'pdf') => {
    setLoading('custody');
    setError(null);
    try {
      const res = await fetch(`/api/xase/v1/bundles/${bundleId}/custody?format=${format}`);
      if (!res.ok) throw new Error('Failed to fetch custody report');
      
      if (format === 'json') {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custody-report-${bundleId}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custody-report-${bundleId}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (e) {
      setError('Failed to download custody report');
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const handleGeneratePDF = async () => {
    setLoading('pdf');
    setError(null);
    try {
      const res = await fetch(`/api/xase/v1/bundles/${bundleId}/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const data = await res.json();
      
      if (data.pdfReportUrl) {
        window.open(data.pdfReportUrl, '_blank');
      }
    } catch (e) {
      setError('Failed to generate PDF report');
      console.error(e);
    } finally {
      setLoading(null);
    }
  };

  const hasArtifacts = pdfReportUrl || bundleManifestHash;

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="w-5 h-5 text-yellow-400" />
        <h2 className="text-lg font-semibold text-white">Legal Artifacts</h2>
      </div>

      <p className="text-sm text-white/60">
        Court-ready documents and cryptographic proofs for compliance and legal proceedings.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Chain of Custody Report */}
        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
          <div className="flex items-center gap-3 flex-1">
            <FileText className="w-4 h-4 text-blue-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Chain of Custody Report</p>
              <p className="text-xs text-white/50 mt-1">
                Complete audit trail of access, export, and disclosure events
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownloadCustody('json')}
              disabled={loading === 'custody'}
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline disabled:opacity-50"
            >
              {loading === 'custody' ? 'Loading...' : 'JSON'}
            </button>
            <span className="text-white/30">|</span>
            <button
              onClick={() => handleDownloadCustody('pdf')}
              disabled={loading === 'custody'}
              className="text-xs text-blue-400 hover:text-blue-300 hover:underline disabled:opacity-50"
            >
              Text
            </button>
          </div>
        </div>

        {/* PDF Legal Report */}
        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
          <div className="flex items-center gap-3 flex-1">
            <FileText className="w-4 h-4 text-green-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">PDF Legal Report (Court-Ready)</p>
              <p className="text-xs text-white/50 mt-1">
                Structured report with cryptographic hashes and signatures
              </p>
              {pdfReportHash && (
                <p className="text-xs text-white/40 font-mono mt-1">
                  Hash: {pdfReportHash.substring(0, 24)}...
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {pdfReportUrl ? (
              <a
                href={pdfReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
              >
                <Download className="w-3 h-3" />
                Download
              </a>
            ) : (
              <button
                onClick={handleGeneratePDF}
                disabled={loading === 'pdf'}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-white/[0.06] text-white hover:bg-white/[0.12] transition-colors disabled:opacity-50"
              >
                {loading === 'pdf' ? 'Generating...' : 'Generate PDF'}
              </button>
            )}
          </div>
        </div>

        {/* Cryptographic Manifest */}
        {bundleManifestHash && (
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <Shield className="w-4 h-4 text-purple-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Cryptographic Manifest</p>
                <p className="text-xs text-white/50 mt-1">
                  Immutable manifest with all file hashes and verification script
                </p>
                <p className="text-xs text-white/40 font-mono mt-1">
                  Hash: {bundleManifestHash.substring(0, 24)}...
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="text-xs text-purple-400 hover:text-purple-300 hover:underline">
                View
              </button>
            </div>
          </div>
        )}

        {/* Legal Format Badge */}
        {legalFormat && (
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <Scale className="w-4 h-4 text-yellow-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Legal Format</p>
                <p className="text-xs text-white/50 mt-1">
                  Compliance standard applied to this bundle
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              {legalFormat.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {!hasArtifacts && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
          <p className="text-sm text-white/60 text-center">
            No legal artifacts generated yet. Generate PDF report to create court-ready documentation.
          </p>
        </div>
      )}

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-300 mb-1">Court Admissibility</h3>
            <p className="text-xs text-yellow-200/80">
              These artifacts are designed for legal proceedings and regulatory submissions. All documents include cryptographic verification and offline validation scripts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
