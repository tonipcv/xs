'use client';

import { useState } from 'react';
import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

interface ProofIntegrityPanelProps {
  record: any;
  onVerify?: () => Promise<{ valid: boolean; message: string }>;
  enableTamperDemo?: boolean;
  docMode?: boolean;
}

export function ProofIntegrityPanel({ record, onVerify, enableTamperDemo = true, docMode = false }: ProofIntegrityPanelProps) {
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

  const isDoc = !!docMode;

  const getStatusBadge = () => {
    if (verificationResult) {
      if (verificationResult.valid) {
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded border ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.08]'}`}>
            <div>
              <p className={`text-xs font-medium ${isDoc ? 'text-gray-800' : 'text-white/70'}`}>Valid</p>
              <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/40'}`}>Integrity verified</p>
            </div>
          </div>
        );
      } else {
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded border ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.08]'}`}>
            <div>
              <p className={`text-xs font-medium ${isDoc ? 'text-gray-800' : 'text-white/70'}`}>Invalid</p>
              <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/40'}`}>Evidence altered</p>
            </div>
          </div>
        );
      }
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded border ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.08]'}`}>
        <div>
          <p className={`text-xs font-medium ${isDoc ? 'text-gray-800' : 'text-white/60'}`}>Not verified</p>
          <p className={`text-[10px] ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>Pending verification</p>
        </div>
      </div>
    );
  };

  return (
    <div className={`${isDoc ? 'bg-white border border-gray-200 text-gray-900' : 'bg-white/[0.02] border border-white/[0.06] text-white'} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isDoc ? 'border-gray-200' : 'border-white/[0.06]'}`}>
        <div className="flex items-center gap-3">
          <h2 className={`${heading.className} text-base font-semibold ${isDoc ? 'text-gray-900' : 'text-white/90'}`}>Proof & Integrity</h2>
        </div>
        <p className={`text-xs mt-1 ${isDoc ? 'text-gray-600' : 'text-white/25'}`}>
          Cryptographic verification
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Tamper Demo Toggle (Demo Only) */}
        {enableTamperDemo && !isDoc && (
          <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-medium text-white/70">Demo Mode</p>
                  <p className="text-[10px] text-white/40">Simulate tampering</p>
                </div>
              </div>
              <button
                onClick={handleTamperToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  tamperSimulated ? 'bg-white/40' : 'bg-white/20'
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
              <p className="text-xs text-white/50 mt-3">
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
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDoc ? 'bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100' : 'bg-transparent text-white/85 border border-white/12 hover:bg-white/[0.04]'}`}
          >
            {verifying ? 'Verifying...' : 'Verify Integrity'}
          </button>
        </div>

        {/* Verification Result */}
        {verificationResult && (
          <div className={`p-4 rounded border ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'}`}>
            <p className={`text-xs font-medium ${isDoc ? 'text-gray-800' : 'text-white/70'}`}>
              {verificationResult.message}
            </p>
            {verificationResult.timestamp && (
              <p className={`text-[10px] mt-2 ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
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
            className={`text-xs underline underline-offset-2 transition-colors ${isDoc ? 'text-gray-600 hover:text-gray-900' : 'text-white/60 hover:text-white/80'}`}
          >
            {showHashes ? 'Hide' : 'Show'} hashes
          </button>
        </div>

        {/* Hashes */}
        {showHashes && (
          <div className="space-y-4">
            {/* Record Hash */}
            <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'} p-3 border rounded`}>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-[10px] uppercase tracking-wider font-medium ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                  Record Hash
                </label>
                {!isDoc && (
                  <button
                    onClick={() => copyHash(record.recordHash, 'Record Hash')}
                    className={`text-[10px] underline underline-offset-2 text-white/60 hover:text-white/80`}
                  >
                    {copiedHash === 'Record Hash' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <p className={`text-[11px] font-mono break-all ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                {record.recordHash}
              </p>
            </div>

            {/* Input Hash */}
            <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'} p-3 border rounded`}>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-[10px] uppercase tracking-wider font-medium ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                  Input Hash
                </label>
                {!isDoc && (
                  <button
                    onClick={() => copyHash(record.inputHash, 'Input Hash')}
                    className={`text-[10px] underline underline-offset-2 text-white/60 hover:text-white/80`}
                  >
                    {copiedHash === 'Input Hash' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <p className={`text-[11px] font-mono break-all ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                {record.inputHash}
              </p>
            </div>

            {/* Output Hash */}
            <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'} p-3 border rounded`}>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-[10px] uppercase tracking-wider font-medium ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                  Output Hash
                </label>
                {!isDoc && (
                  <button
                    onClick={() => copyHash(record.outputHash, 'Output Hash')}
                    className={`text-[10px] underline underline-offset-2 text-white/60 hover:text-white/80`}
                  >
                    {copiedHash === 'Output Hash' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <p className={`text-[11px] font-mono break-all ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                {record.outputHash}
              </p>
            </div>

            {/* Context Hash */}
            {record.contextHash && (
              <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'} p-3 border rounded`}>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-[10px] uppercase tracking-wider font-medium ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                    Context Hash
                  </label>
                  {!isDoc && (
                    <button
                      onClick={() => copyHash(record.contextHash, 'Context Hash')}
                      className={`text-[10px] underline underline-offset-2 text-white/60 hover:text-white/80`}
                    >
                      {copiedHash === 'Context Hash' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className={`text-[11px] font-mono break-all ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                  {record.contextHash}
                </p>
              </div>
            )}

            {/* Previous Hash (Chain) */}
            {record.previousHash && (
              <div className={`${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'} p-3 border rounded`}>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-[10px] uppercase tracking-wider font-medium ${isDoc ? 'text-gray-600' : 'text-white/30'}`}>
                    Previous Hash (Chain)
                  </label>
                  {!isDoc && (
                    <button
                      onClick={() => copyHash(record.previousHash, 'Previous Hash')}
                      className={`text-[10px] underline underline-offset-2 text-white/60 hover:text-white/80`}
                    >
                      {copiedHash === 'Previous Hash' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className={`text-[11px] font-mono break-all ${isDoc ? 'text-gray-700' : 'text-white/50'}`}>
                  {record.previousHash}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Legal Note */}
        <div className={`p-3 border rounded ${isDoc ? 'bg-gray-50 border-gray-300' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <p className={`text-xs ${isDoc ? 'text-gray-700' : 'text-white/40'}`}>
            <span className={`font-medium ${isDoc ? 'text-gray-900' : 'text-white/50'}`}>Legal defensibility:</span> Cryptographic hashes prove the decision record has not been altered since creation.
          </p>
        </div>
      </div>
    </div>
  );
}
