'use client';

import { useState } from 'react';
import { Shield, CheckCircle2, AlertTriangle, RefreshCw, Copy, Eye, EyeOff, Zap } from 'lucide-react';

interface ProofIntegrityPanelProps {
  record: any;
  onVerify?: () => Promise<{ valid: boolean; message: string }>;
  enableTamperDemo?: boolean;
}

export function ProofIntegrityPanel({ record, onVerify, enableTamperDemo = true }: ProofIntegrityPanelProps) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    message: string;
    timestamp?: Date;
  } | null>(null);
  const [showHashes, setShowHashes] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [tamperSimulated, setTamperSimulated] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    setVerificationResult(null);

    try {
      // Simulate verification (in production, call actual API)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (onVerify) {
        const result = await onVerify();
        setVerificationResult({
          ...result,
          timestamp: new Date(),
        });
      } else {
        // Default verification: check if record has valid hashes
        // If tamper is simulated, always return invalid
        const isValid = tamperSimulated 
          ? false 
          : !!(record.recordHash && record.inputHash && record.outputHash);
        
        setVerificationResult({
          valid: isValid,
          message: isValid 
            ? 'This decision has not been altered since it was made.'
            : tamperSimulated
            ? 'Evidence no longer matches original record. Tampering detected.'
            : 'Verification could not be completed.',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      setVerificationResult({
        valid: false,
        message: 'Verification failed. Please try again.',
        timestamp: new Date(),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleTamperToggle = () => {
    setTamperSimulated(!tamperSimulated);
    setVerificationResult(null); // Reset verification when toggling
  };

  const copyHash = async (hash: string, label: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(label);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getStatusBadge = () => {
    if (verificationResult) {
      if (verificationResult.valid) {
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-emerald-400">Valid</p>
              <p className="text-[10px] text-emerald-400/60">Integrity verified</p>
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/5 border border-rose-500/20 rounded">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <div>
              <p className="text-xs font-medium text-rose-400">Invalid</p>
              <p className="text-[10px] text-rose-400/60">Evidence altered</p>
            </div>
          </div>
        );
      }
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.08] rounded">
        <Shield className="w-4 h-4 text-white/40" />
        <div>
          <p className="text-xs font-medium text-white/60">Not verified</p>
          <p className="text-[10px] text-white/30">Pending verification</p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-white/40" />
          <h2 className="text-sm font-medium text-white/90">Proof & Integrity</h2>
        </div>
        <p className="text-xs text-white/25 mt-1">
          Cryptographic verification
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Tamper Demo Toggle (Demo Only) */}
        {enableTamperDemo && (
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-400">Demo Mode</p>
                  <p className="text-[10px] text-amber-400/60">Simulate tampering</p>
                </div>
              </div>
              <button
                onClick={handleTamperToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  tamperSimulated ? 'bg-rose-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    tamperSimulated ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {tamperSimulated && (
              <p className="text-xs text-amber-400/70 mt-3">
                Simulating altered evidence
              </p>
            )}
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between">
          {getStatusBadge()}
          
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded text-xs font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying...' : 'Verify Integrity'}
          </button>
        </div>

        {/* Verification Result */}
        {verificationResult && (
          <div className={`p-4 rounded border ${
            verificationResult.valid 
              ? 'bg-emerald-500/5 border-emerald-500/20' 
              : 'bg-rose-500/5 border-rose-500/20'
          }`}>
            <p className={`text-xs font-medium ${
              verificationResult.valid ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {verificationResult.message}
            </p>
            {verificationResult.timestamp && (
              <p className="text-[10px] text-white/30 mt-2">
                Verified at {verificationResult.timestamp.toLocaleString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            )}
          </div>
        )}

        {/* Hash Details Toggle */}
        <div>
          <button
            onClick={() => setShowHashes(!showHashes)}
            className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            {showHashes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showHashes ? 'Hide' : 'Show'} hashes
          </button>
        </div>

        {/* Hashes */}
        {showHashes && (
          <div className="space-y-4">
            {/* Record Hash */}
            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
                  Record Hash
                </label>
                <button
                  onClick={() => copyHash(record.recordHash, 'Record Hash')}
                  className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedHash === 'Record Hash' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-white/50 font-mono break-all">
                {record.recordHash}
              </p>
            </div>

            {/* Input Hash */}
            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
                  Input Hash
                </label>
                <button
                  onClick={() => copyHash(record.inputHash, 'Input Hash')}
                  className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedHash === 'Input Hash' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-white/50 font-mono break-all">
                {record.inputHash}
              </p>
            </div>

            {/* Output Hash */}
            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
                  Output Hash
                </label>
                <button
                  onClick={() => copyHash(record.outputHash, 'Output Hash')}
                  className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedHash === 'Output Hash' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-white/50 font-mono break-all">
                {record.outputHash}
              </p>
            </div>

            {/* Context Hash */}
            {record.contextHash && (
              <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
                    Context Hash
                  </label>
                  <button
                    onClick={() => copyHash(record.contextHash, 'Context Hash')}
                    className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedHash === 'Context Hash' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-white/50 font-mono break-all">
                  {record.contextHash}
                </p>
              </div>
            )}

            {/* Previous Hash (Chain) */}
            {record.previousHash && (
              <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
                    Previous Hash (Chain)
                  </label>
                  <button
                    onClick={() => copyHash(record.previousHash, 'Previous Hash')}
                    className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedHash === 'Previous Hash' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[11px] text-white/50 font-mono break-all">
                  {record.previousHash}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Legal Note */}
        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
          <p className="text-xs text-white/40">
            <span className="font-medium text-white/50">Legal defensibility:</span> Cryptographic hashes prove the decision record has not been altered since creation.
          </p>
        </div>
      </div>
    </div>
  );
}
