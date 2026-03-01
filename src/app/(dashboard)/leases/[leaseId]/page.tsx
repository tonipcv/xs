/**
 * Lease Details Page with Auto-Renew
 * F2-011: Auto-renew de Lease via UI
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface LeaseDetails {
  leaseId: string;
  datasetId: string;
  datasetName: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  autoRenew: boolean;
  autoRenewConfig?: {
    enabled: boolean;
    maxRenewals: number;
    budgetLimit: number;
    currentRenewals: number;
  };
  usage: {
    bytesProcessed: number;
    requestCount: number;
    cost: number;
  };
}

export default function LeaseDetailsPage() {
  const params = useParams();
  const leaseId = params.leaseId as string;
  
  const [lease, setLease] = useState<LeaseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(false);
  const [maxRenewals, setMaxRenewals] = useState(10);
  const [budgetLimit, setBudgetLimit] = useState(1000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLeaseDetails();
  }, [leaseId]);

  const fetchLeaseDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leases/${leaseId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch lease details');
      }

      const data = await response.json();
      setLease(data);
      
      if (data.autoRenewConfig) {
        setAutoRenewEnabled(data.autoRenewConfig.enabled);
        setMaxRenewals(data.autoRenewConfig.maxRenewals);
        setBudgetLimit(data.autoRenewConfig.budgetLimit);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutoRenew = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/leases/${leaseId}/auto-renew`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: autoRenewEnabled,
          maxRenewals,
          budgetLimit,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update auto-renew settings');
      }

      setSuccess('Auto-renew settings saved successfully');
      fetchLeaseDetails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRenewNow = async () => {
    try {
      const response = await fetch(`/api/leases/${leaseId}/renew`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to renew lease');
      }

      setSuccess('Lease renewed successfully');
      fetchLeaseDetails();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'expiring_soon': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff < 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} remaining`;
    }
    
    return `${hours}h ${minutes}m remaining`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading lease details...</p>
        </div>
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Lease not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Lease Details</h1>
          <p className="text-gray-600 mt-2">Manage your data access lease</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        {/* Lease Overview */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{lease.datasetName}</h2>
              <p className="text-sm text-gray-500 mt-1">Lease ID: {lease.leaseId}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(lease.status)}`}>
              {lease.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(lease.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Expires</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(lease.expiresAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {getTimeRemaining(lease.expiresAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Auto-Renew</p>
              <p className="text-lg font-semibold text-gray-900">
                {lease.autoRenew ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleRenewNow}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Renew Now
            </button>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Statistics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Bytes Processed</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {(lease.usage.bytesProcessed / (1024 * 1024 * 1024)).toFixed(2)} GB
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Requests</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {lease.usage.requestCount.toLocaleString()}
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${lease.usage.cost.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Auto-Renew Configuration */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Auto-Renew Settings</h3>
          
          <div className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Enable Auto-Renew</p>
                <p className="text-sm text-gray-500">Automatically renew this lease before it expires</p>
              </div>
              <button
                onClick={() => setAutoRenewEnabled(!autoRenewEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoRenewEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoRenewEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {autoRenewEnabled && (
              <>
                {/* Max Renewals */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Renewals
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maxRenewals}
                    onChange={(e) => setMaxRenewals(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Stop auto-renewing after this many renewals
                  </p>
                  {lease.autoRenewConfig && (
                    <p className="text-sm text-blue-600 mt-1">
                      Current renewals: {lease.autoRenewConfig.currentRenewals} / {maxRenewals}
                    </p>
                  )}
                </div>

                {/* Budget Limit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Budget Limit (USD)
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Stop auto-renewing when total cost exceeds this amount
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    Current cost: ${lease.usage.cost.toFixed(2)} / ${budgetLimit}
                  </p>
                </div>

                {/* Warning */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Auto-renew will stop if either the maximum renewals or budget limit is reached.
                    You will be notified via email when auto-renew executes or stops.
                  </p>
                </div>
              </>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={handleSaveAutoRenew}
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
