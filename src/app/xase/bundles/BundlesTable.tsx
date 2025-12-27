'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TableFilters } from '@/components/TableFilters';
import { TablePagination } from '@/components/TablePagination';
import { arrayToCSV, downloadCSV, downloadJSON } from '@/lib/table-utils';
import { ArrowUpDown, Download, FileArchive, Plus } from 'lucide-react';
import { CreateBundleModal } from './CreateBundleModal';

interface EvidenceBundle {
  id: string;
  bundleId: string;
  status: string;
  recordCount: number;
  purpose: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

interface BundlesTableProps {
  initialBundles: EvidenceBundle[];
  initialTotal: number;
  tenantId: string;
}

export function BundlesTable({
  initialBundles,
  initialTotal,
  tenantId,
}: BundlesTableProps) {
  const [bundles, setBundles] = useState<EvidenceBundle[]>(initialBundles);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(initialBundles.length >= 20);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchBundles = async (newCursor?: string, direction: 'next' | 'prev' = 'next') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newCursor) params.set('cursor', newCursor);
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sortField', sortField);
      params.set('sortDir', sortDir);

      const res = await fetch(`/api/xase/bundles?${params.toString()}`);
      const data = await res.json();

      setBundles(data.bundles);
      setTotal(data.total);
      setHasMore(data.hasMore);
      
      if (direction === 'next' && cursor) {
        setHistory([...history, cursor]);
        setPage(page + 1);
      } else if (direction === 'prev' && history.length > 0) {
        setHistory(history.slice(0, -1));
        setPage(page - 1);
      }
      
      setCursor(data.nextCursor);
    } catch (error) {
      console.error('Failed to fetch bundles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (hasMore && cursor) {
      fetchBundles(cursor, 'next');
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevCursor = history[history.length - 1];
      fetchBundles(prevCursor, 'prev');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    
    if (key === 'status') {
      setStatusFilter(value);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setCursor(undefined);
    setHistory([]);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    fetchBundles();
  };

  const handleSort = (field: string) => {
    const newDir = sortField === field && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortDir(newDir);
    setCursor(undefined);
    setHistory([]);
    setPage(1);
  };

  const handleDownload = async (bundleId: string) => {
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;
      const res = await fetch(`/api/xase/bundles/${bundleId}/download`, {
        method: 'POST',
        headers: {
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });
      
      if (!res.ok) {
        throw new Error('Download failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-bundle-${bundleId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download bundle:', error);
      alert('Failed to download bundle. Please try again.');
    }
  };

  const handleExportCSV = () => {
    const columns = [
      { key: 'bundleId' as keyof EvidenceBundle, label: 'Bundle ID' },
      { key: 'status' as keyof EvidenceBundle, label: 'Status' },
      { key: 'recordCount' as keyof EvidenceBundle, label: 'Records' },
      { key: 'purpose' as keyof EvidenceBundle, label: 'Purpose' },
      { key: 'createdBy' as keyof EvidenceBundle, label: 'Created By' },
      { key: 'createdAt' as keyof EvidenceBundle, label: 'Created At' },
    ];
    
    const csv = arrayToCSV(
      bundles.map((b) => ({
        ...b,
        createdAt: new Date(b.createdAt).toISOString(),
        purpose: b.purpose || 'N/A',
      })),
      columns
    );
    
    downloadCSV(`evidence-bundles-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handleExportJSON = () => {
    downloadJSON(
      `evidence-bundles-${new Date().toISOString().split('T')[0]}.json`,
      bundles
    );
  };

  const handleBundleCreated = () => {
    setShowCreateModal(false);
    fetchBundles(); // Refresh list
  };

  const handleReprocess = async (bundleId: string) => {
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.split('; ').find((c) => c.startsWith('x-csrf-token='))?.split('=')[1]
        : undefined;
      const res = await fetch(`/api/xase/bundles/${bundleId}/reprocess`, {
        method: 'POST',
        headers: {
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Reprocess failed');
      }
      // Refresh list after reprocess
      fetchBundles();
    } catch (e) {
      alert((e as any).message || 'Failed to reprocess');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search || statusFilter) {
        fetchBundles();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, statusFilter, sortField, sortDir]);

  const hasActiveFilters = !!(search || statusFilter);

  const getStatusColor = (status: string) => {
    // Neutral palette across all statuses
    return 'bg-white/[0.04] text-white/80 border-white/[0.08]';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TableFilters
          searchPlaceholder="Search by bundle ID or purpose..."
          searchValue={search}
          onSearchChange={handleSearch}
          filters={[
            {
              label: 'Status',
              key: 'status',
              value: statusFilter,
              options: [
                { label: 'Ready', value: 'READY' },
                { label: 'Pending', value: 'PENDING' },
                { label: 'Processing', value: 'PROCESSING' },
                { label: 'Failed', value: 'FAILED' },
              ],
            },
          ]}
          onFilterChange={handleFilterChange}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-4 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Bundle
        </button>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  BUNDLE ID
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    STATUS
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('recordCount')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    RECORDS
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  PURPOSE
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  CREATED BY
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    CREATED
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => (
                <tr
                  key={bundle.id}
                  className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-white font-mono">
                    <Link href={`/xase/bundles/${bundle.bundleId}`} className="hover:underline">
                      {bundle.bundleId.substring(0, 16)}...
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded border ${getStatusColor(bundle.status)}`}
                    >
                      {bundle.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {bundle.recordCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80 max-w-xs truncate">
                    {bundle.purpose || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {bundle.createdBy}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {new Date(bundle.createdAt).toLocaleString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4">
                    {bundle.status === 'READY' ? (
                      <button
                        onClick={() => handleDownload(bundle.bundleId)}
                        className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40">
                          {bundle.status === 'PROCESSING' ? 'Processing...' : 'Pending'}
                        </span>
                        <button
                          onClick={() => handleReprocess(bundle.bundleId)}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors"
                          title="Reprocess bundle"
                        >
                          Reprocess
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TablePagination
          hasMore={hasMore}
          hasPrev={history.length > 0}
          onNext={handleNext}
          onPrev={handlePrev}
          currentPage={page}
          totalItems={total}
        />
      </div>

      {showCreateModal && (
        <CreateBundleModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleBundleCreated}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
