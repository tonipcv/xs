'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Policy {
  policyId: string;
  datasetId: string;
  pricePerHour: number;
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

      const res = await fetch('/api/v1/leases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          policyId: selectedPolicy.policyId,
          ttlMinutes,
          requestedBy: 'web-ui',
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

  const estimatedCost = selectedPolicy
    ? (estimatedHours * selectedPolicy.pricePerHour).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 ${
                s === step
                  ? 'bg-gray-900 text-white'
                  : s < step
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}
            >
              {s < step ? '✓' : s}
            </div>
            <span className={`text-sm ${s <= step ? 'text-gray-700' : 'text-gray-400'}`}>
              {s === 1 ? 'Select Dataset' : s === 2 ? 'Configure' : 'Complete'}
            </span>
            {s < 3 && <div className="w-12 h-px bg-gray-200" />}
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
                    <span className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 border border-green-400/30">
                      Available
                    </span>
                  </div>

                  {policy.dataset.description && (
                    <p className="text-sm text-gray-600">{policy.dataset.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Duration</p>
                      <p className="text-sm text-gray-900 font-mono mt-0.5">
                        {policy.dataset.totalDurationHours.toFixed(1)}h
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Price</p>
                      <p className="text-sm text-gray-900 font-mono mt-0.5">
                        ${policy.pricePerHour.toFixed(2)}/h
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
            <h2 className="text-lg font-semibold text-gray-900">Configure Lease</h2>
            <button
              onClick={() => setStep(1)}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Change Dataset
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Selected Dataset</h3>
            <p className="text-base text-gray-600">{selectedPolicy.dataset.name}</p>
            <p className="text-gray-600 mb-4">
              {selectedPolicy.dataset.totalDurationHours.toFixed(1)}h available · $
              {selectedPolicy.pricePerHour.toFixed(2)}/h
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lease Duration (TTL)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 60, 240, 480].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setTtlMinutes(minutes)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      ttlMinutes === minutes
                        ? 'bg-white text-black'
                        : 'bg-white/[0.05] text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Lease will automatically expire after this duration
              </p>
            </div>

            {selectedPolicy.allowedEnvironment && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Environment
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['training', 'validation'].map((env) => (
                    <button
                      key={env}
                      onClick={() => setEnvironment(env as 'training' | 'validation')}
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estimated Hours to Consume
              </label>
              <input
                type="number"
                min="0.1"
                max={selectedPolicy.maxHours || 1000}
                step="0.1"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <p className="text-xs text-gray-500 mt-2">
                Estimated cost: ${estimatedCost}
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-4 py-3 bg-white/[0.05] text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleRequestLease}
              disabled={loading}
              className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Requesting...' : 'Request Lease'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && leaseId && selectedPolicy && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Lease Granted!</h2>
            <p className="text-sm text-gray-600">
              Your lease is now active and ready for streaming
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Lease ID</p>
              <p className="text-sm text-gray-900 font-mono mt-1">{leaseId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Dataset</p>
              <p className="text-sm text-gray-600 mt-1">{selectedPolicy.dataset.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Expires In</p>
              <p className="text-sm text-gray-600 mt-1">
                {ttlMinutes < 60 ? `${ttlMinutes} minutes` : `${ttlMinutes / 60} hours`}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Next Steps</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li>1. Use the Python SDK to stream training data</li>
              <li>2. Pass your lease ID to the GovernedDataset class</li>
              <li>3. Monitor your lease status in the dashboard</li>
            </ol>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/xase/training')}
              className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              View Dashboard
            </button>
            <button
              onClick={() => {
                setStep(1);
                setSelectedPolicy(null);
                setLeaseId(null);
              }}
              className="flex-1 px-4 py-3 bg-white/[0.05] text-white/80 rounded-lg text-sm font-medium hover:bg-white/[0.08] transition-colors"
            >
              Request Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
