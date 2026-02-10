'use client';

import { useState } from 'react';
import { FileText, CheckCircle2, Download, Loader2, Package, Shield, Clock, FileCheck } from 'lucide-react';

interface AuditPackageWizardProps {
  transactionId: string;
  onComplete?: (bundleId: string) => void;
}

export function AuditPackageWizard({ transactionId, onComplete }: AuditPackageWizardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bundleId, setBundleId] = useState<string | null>(null);

  const steps = [
    { id: 'decision', label: 'Decision record', icon: FileText },
    { id: 'policy', label: 'Policy snapshot', icon: Shield },
    { id: 'model', label: 'Model metadata', icon: FileCheck },
    { id: 'intervention', label: 'Human intervention log', icon: Clock },
    { id: 'integrity', label: 'Integrity verification', icon: CheckCircle2 },
    { id: 'verify', label: 'Offline verification script', icon: Package },
  ];

  const handleGenerate = async () => {
    setGenerating(true);
    setCurrentStep(0);

    try {
      // Simulate step-by-step generation
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i);
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      // Call actual API to generate bundle
      const response = await fetch(`/api/records/${transactionId}/evidence?include_payloads=true&mode=json`, {
        method: 'GET',
      });

      if (!response.ok) throw new Error('Failed to generate package');

      const data = await response.json();
      setBundleId(data.bundleId || 'bundle_' + Date.now());
      setCurrentStep(steps.length);

      if (onComplete && data.bundleId) {
        onComplete(data.bundleId);
      }
    } catch (error) {
      console.error('Failed to generate audit package:', error);
      alert('Failed to generate audit package. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    window.location.href = `/api/records/${transactionId}/evidence?include_payloads=true&mode=redirect`;
    setTimeout(() => setIsOpen(false), 1000);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-3 py-1.5 border border-white/12 bg-transparent text-white/85 rounded text-xs font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors"
      >
        Create Audit Package
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1b1f] border border-white/10 rounded-2xl max-w-2xl w-full shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-white/40" />
                  <div>
                    <h2 className="text-sm font-medium text-white/90">
                      Create Audit Package
                    </h2>
                    <p className="text-xs text-white/30 mt-0.5">
                      FCA-compliant evidence submission
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={generating}
                  className="text-white/40 hover:text-white/80 transition-colors disabled:opacity-50 text-lg"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {!generating && !bundleId && (
                <div className="space-y-6">
                  <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
                    <p className="text-xs text-white/50">
                      This package will include all evidence required for regulatory audit or legal proceedings.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-white/60">Package will include:</p>
                    <div className="grid grid-cols-1 gap-2">
                      {steps.map((step) => {
                        const Icon = step.icon;
                        return (
                          <div
                            key={step.id}
                            className="flex items-center gap-3 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded"
                          >
                            <Icon className="w-3.5 h-3.5 text-white/40" />
                            <span className="text-xs text-white/60">{step.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsOpen(false)}
                      className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] text-white/80 rounded text-xs font-medium hover:bg-white/[0.06] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="flex-1 px-3 py-2 bg-white text-black rounded text-xs font-medium hover:bg-white/90 transition-colors"
                    >
                      Generate Package
                    </button>
                  </div>
                </div>
              )}

              {generating && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 text-white/40 animate-spin mx-auto mb-3" />
                    <p className="text-xs text-white/60">Generating audit package...</p>
                  </div>

                  <div className="space-y-2">
                    {steps.map((step, index) => {
                      const Icon = step.icon;
                      const isCompleted = index < currentStep;
                      const isCurrent = index === currentStep;
                      
                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-3 p-2.5 rounded border transition-all ${
                            isCompleted
                              ? 'bg-emerald-500/5 border-emerald-500/20'
                              : isCurrent
                              ? 'bg-white/[0.04] border-white/[0.12]'
                              : 'bg-white/[0.02] border-white/[0.06]'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : isCurrent ? (
                            <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                          ) : (
                            <Icon className="w-4 h-4 text-white/30" />
                          )}
                          <span className={`text-xs ${
                            isCompleted ? 'text-emerald-400/90' :
                            isCurrent ? 'text-white/80' :
                            'text-white/40'
                          }`}>
                            {step.label}
                          </span>
                          {isCompleted && (
                            <span className="ml-auto text-[10px] text-emerald-400/60">Complete</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {bundleId && !generating && (
                <div className="space-y-6">
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-emerald-500/5 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-medium text-white/90 mb-2">
                      Audit Package Ready
                    </h3>
                    <p className="text-xs text-white/40">
                      FCA-compliant format
                    </p>
                  </div>

                  <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/30">Bundle ID</span>
                        <span className="text-white/60 font-mono">{bundleId.substring(0, 20)}...</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/30">Format</span>
                        <span className="text-white/60">ZIP Archive</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/30">Includes</span>
                        <span className="text-white/60">Full payloads + verification script</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsOpen(false)}
                      className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] text-white/80 rounded text-xs font-medium hover:bg-white/[0.06] transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-white text-black rounded text-xs font-medium hover:bg-white/90 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Package
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
