'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Policy {
  policyId: string;
  datasetId: string;
  // pricePerHour: number; // Not yet in schema
  maxHours: number | null;
  maxConcurrentLeases: number | null;
  allowedEnvironment: string | null;
  dataset: {
    datasetId: string;
    name: string;
    language: string | null;
    totalDurationHours: number;
    description: string | null;
  };
}

interface LeaseRequestWizardProps {
  policies: Policy[];
  tenantId: string;
}

export function LeaseRequestWizard({ policies, tenantId }: LeaseRequestWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [environment, setEnvironment] = useState<'training' | 'validation'>('training');
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [leaseId, setLeaseId] = useState<string | null>(null);

  const handleSelectDataset = (policy: Policy) => {
    setSelectedPolicy(policy);
    setStep(2);
  };

  const handleRequestLease = async () => {
    if (!selectedPolicy) return;

    setLoading(true);
    setError('');

    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;

      // Try to read API key from cookies or localStorage
      let apiKey: string | undefined = undefined;
      if (typeof document !== 'undefined') {
        const cookieMap = Object.fromEntries(document.cookie.split('; ').map(v => v.split('=')));
        apiKey = cookieMap['X-API-Key'] || cookieMap['x-api-key'] || cookieMap['api_key'] || undefined;
      }
      if (!apiKey && typeof window !== 'undefined') {
        try {
          apiKey = window.localStorage.getItem('X_API_KEY') || window.localStorage.getItem('xase_api_key') || undefined;
        } catch {}
      }

      if (!apiKey) {
        setError('Missing API key. Set X-API-Key in cookies or localStorage (X_API_KEY).');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/v1/leases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          datasetId: selectedPolicy.dataset.datasetId,
          ttlSeconds: Math.max(60, Math.floor(ttlMinutes * 60)),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to request lease');
      }

      setLeaseId(data.leaseId);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to request lease');
    } finally {
      setLoading(false);
    }
  };

  const estimatedCost = '0.00'; // Pricing not yet implemented in schema

  return (
    <div className="space-y-4">
      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center ${
                s === step
                  ? 'bg-gray-900 text-white'
                  : s < step
                  ? 'bg-gray-200 text-gray-700 border border-gray-300'
                  : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}
            >
              <span className="text-[11px]">{s < step ? '✓' : s}</span>
            </div>
            <span className={`text-[11px] ${s <= step ? 'text-gray-700' : 'text-gray-400'}`}>
              {s === 1 ? 'Select Dataset' : s === 2 ? 'Configure' : 'Complete'}
            </span>
            {s < 3 && <div className="w-4 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Dataset */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Select a Dataset</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {policies.map((policy) => (
              <button
                key={policy.policyId}
                onClick={() => handleSelectDataset(policy)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-medium text-gray-900">{policy.dataset.name}</h3>
                      {policy.dataset.language && (
                        <p className="text-xs text-gray-500">{policy.dataset.language}</p>
                      )}
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-gray-300 text-gray-700 bg-white">Available</span>
                  </div>

                  {policy.dataset.description && (
                    <p className="text-sm text-gray-600">{policy.dataset.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Duration</p>
                      <p className="text-sm text-gray-900 tabular-nums mt-0.5">
                        {policy.dataset.totalDurationHours.toFixed(1)}h
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Price</p>
                      <p className="text-sm text-gray-900 tabular-nums mt-0.5">
                        TBD
                      </p>
                    </div>
                  </div>

                  {policy.maxConcurrentLeases && (
                    <p className="text-xs text-gray-500">
                      Max concurrent leases: {policy.maxConcurrentLeases}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Configure Lease */}
      {step === 2 && selectedPolicy && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-gray-900">Configure Lease</h2>
            <button
              onClick={() => setStep(1)}
              className="text-xs text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Change Dataset
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="text-xs font-medium text-gray-900 mb-1">Selected Dataset</h3>
            <p className="text-sm text-gray-900">{selectedPolicy.dataset.name}</p>
            <p className="text-xs text-gray-600 mb-0">
              <span className="tabular-nums">{selectedPolicy.dataset.totalDurationHours.toFixed(1)}h</span> available
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Lease Duration (TTL)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[15, 60, 240, 480].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setTtlMinutes(minutes)}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-all ${
                      ttlMinutes === minutes
                        ? 'bg-white text-black'
                        : 'bg-white/[0.05] text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                Lease will automatically expire after this duration
              </p>
            </div>

            {selectedPolicy.allowedEnvironment && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Environment
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {['training', 'validation'].map((env) => (
                    <button
                      key={env}
                      onClick={() => setEnvironment(env as 'training' | 'validation')}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-all ${
                        environment === env
                          ? 'bg-white text-black'
                          : 'bg-white/[0.05] text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {env.charAt(0).toUpperCase() + env.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Estimated Hours to Consume
              </label>
              <input
                type="number"
                min="0.1"
                max={selectedPolicy.maxHours || 1000}
                step="0.1"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 1)}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 tabular-nums text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                Estimated cost: <span className="tabular-nums">${estimatedCost}</span>
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
              <p className="text-xs text-red-700">{error}</p>
              {error.toLowerCase().includes('missing api key') && (
                <div className="flex items-center gap-2">
                  <input
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste your API key"
                    className="flex-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={() => {
                      try {
                        if (!apiKeyInput) return;
                        // Save in localStorage
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('X_API_KEY', apiKeyInput);
                        }
                        // Also set a cookie for convenience
                        if (typeof document !== 'undefined') {
                          document.cookie = `X-API-Key=${apiKeyInput}; path=/`;
                        }
                        setError('');
                      } catch {}
                    }}
                    className="px-2.5 py-1.5 bg-gray-900 text-white rounded text-sm"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-2.5 py-1.5 bg-white/[0.05] text-gray-700 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleRequestLease}
              disabled={loading}
              className="px-2.5 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Requesting...' : 'Request Lease'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && leaseId && selectedPolicy && (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
            <div className="w-6 h-6 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center mx-auto mb-2">
              <span className="text-[11px] text-gray-700">✓</span>
            </div>
            <h2 className="text-sm font-medium text-gray-900 mb-1">Lease Granted</h2>
            <p className="text-xs text-gray-600">
              Your lease is active and ready for streaming
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Lease ID</p>
              <p className="text-xs text-gray-900 font-mono mt-0.5">{leaseId}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Dataset</p>
              <p className="text-xs text-gray-700 mt-0.5">{selectedPolicy.dataset.name}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Expires In</p>
              <p className="text-xs text-gray-700 mt-0.5">
                {ttlMinutes < 60 ? `${ttlMinutes} minutes` : `${ttlMinutes / 60} hours`}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="text-xs font-medium text-gray-900 mb-2">Next Steps</h3>
            <ol className="space-y-1.5 text-xs text-gray-600">
              <li>1. Use the Python SDK to stream training data</li>
              <li>2. Pass your lease ID to the GovernedDataset class</li>
              <li>3. Monitor your lease status in the dashboard</li>
            </ol>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push('/xase/training')}
              className="mt-2 px-2.5 py-1.5 bg-white border border-gray-300 text-gray-900 rounded text-sm hover:bg-gray-50"
            >
              View Dashboard
            </button>
            <button
              onClick={() => {
                setStep(1);
                setSelectedPolicy(null);
                setLeaseId(null);
              }}
              className="flex-1 px-2.5 py-1.5 bg-white border border-gray-300 text-gray-900 rounded text-sm hover:bg-gray-50"
            >
              Request Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
