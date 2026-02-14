'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Lease {
  leaseId: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  clientTenantId: string;
  policy: {
    policyId: string;
    dataset: {
      datasetId: string;
      name: string;
    };
  };
}

interface LeasesTableProps {
  initialLeases: Lease[];
  initialTotal: number;
  tenantId: string;
}

export function LeasesTable({ initialLeases, initialTotal, tenantId }: LeasesTableProps) {
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[]>(initialLeases);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
    // Neutral grayscale badges (no colors)
    const colors = {
      ACTIVE: 'text-gray-800 border-gray-300 bg-gray-50',
      EXPIRED: 'text-gray-600 border-gray-300 bg-gray-50',
      REVOKED: 'text-gray-700 border-gray-300 bg-gray-50',
    };
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded border ${colors[status as keyof typeof colors] || 'text-gray-700 border-gray-300 bg-gray-50'} uppercase font-medium tracking-wide`}>
        {status}
      </span>
    );
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Expired';
    
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const handleRevoke = async (leaseId: string) => {
    if (!confirm('Are you sure you want to revoke this lease? This will immediately terminate access.')) {
      return;
    }

    const reason = prompt('Reason for revocation (optional):') || 'Revoked by data holder';

    setRevoking(leaseId);
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;

      const res = await fetch(`/api/v1/leases/${leaseId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke lease');
      }

      router.refresh();
    } catch (error: any) {
      alert(error.message || 'Failed to revoke lease');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  STATUS
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  DATASET
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  CLIENT
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  ISSUED
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  EXPIRES
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  TIME LEFT
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-700 tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease) => {
                const timeLeft = getTimeRemaining(lease.expiresAt);
                const isActive = lease.status === 'ACTIVE';
                
                return (
                  <tr
                    key={lease.leaseId}
                    className="border-b border-gray-200 hover:bg-white transition-colors"
                  >
                    <td className="px-6 py-4">
                      {getStatusBadge(lease.status)}
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-gray-900">{lease.policy.dataset.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {lease.policy.dataset.datasetId.substring(0, 16)}...
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 font-mono">
                        {lease.clientTenantId.substring(0, 12)}...
                      </p>
                    </td>

                    <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">
                      {new Date(lease.issuedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="px-6 py-4 text-xs text-gray-600 tabular-nums">
                      {new Date(lease.expiresAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium tabular-nums ${
                        isActive && timeLeft !== 'Expired' ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {timeLeft}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      {isActive ? (
                        <button
                          onClick={() => handleRevoke(lease.leaseId)}
                          disabled={revoking === lease.leaseId}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 bg-gray-50 text-gray-700 rounded text-xs font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {revoking === lease.leaseId ? 'Revoking...' : 'Revoke'}
                        </button>
                      ) : lease.status === 'REVOKED' ? (
                        <div className="text-xs text-gray-500">
                          <p>Revoked</p>
                          {lease.revokedReason && (
                            <p className="text-[10px] text-gray-500 mt-0.5">{lease.revokedReason}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
