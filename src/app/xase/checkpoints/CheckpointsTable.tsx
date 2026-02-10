'use client';

import { useState, useEffect } from 'react';
import { TableFilters } from '@/components/TableFilters';
import { TablePagination } from '@/components/TablePagination';
import { arrayToCSV, downloadCSV, downloadJSON } from '@/lib/table-utils';
import { ArrowUpDown } from 'lucide-react';

interface Checkpoint {
  id: string;
  checkpointId: string;
  checkpointNumber: number;
  recordCount: number;
  isVerified: boolean;
  timestamp: Date;
  signatureAlgo: string | null;
}

interface CheckpointsTableProps {
  initialCheckpoints: Checkpoint[];
  initialTotal: number;
  tenantId: string;
}

export function CheckpointsTable({
  initialCheckpoints,
  initialTotal,
  tenantId,
}: CheckpointsTableProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(initialCheckpoints);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(initialCheckpoints.length >= 20);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<string>('checkpointNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchCheckpoints = async (newCursor?: string, direction: 'next' | 'prev' = 'next') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newCursor) params.set('cursor', newCursor);
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sortField', sortField);
      params.set('sortDir', sortDir);

      const res = await fetch(`/api/xase/checkpoints?${params.toString()}`);
      const data = await res.json();

      setCheckpoints(data.checkpoints);
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
      console.error('Failed to fetch checkpoints:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (hasMore && cursor) {
      fetchCheckpoints(cursor, 'next');
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevCursor = history[history.length - 1];
      fetchCheckpoints(prevCursor, 'prev');
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
    fetchCheckpoints();
  };

  const handleSort = (field: string) => {
    const newDir = sortField === field && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortDir(newDir);
    setCursor(undefined);
    setHistory([]);
    setPage(1);
  };

  const handleExportCSV = () => {
    const columns = [
      { key: 'checkpointNumber' as keyof Checkpoint, label: 'Checkpoint #' },
      { key: 'checkpointId' as keyof Checkpoint, label: 'Checkpoint ID' },
      { key: 'recordCount' as keyof Checkpoint, label: 'Records' },
      { key: 'signatureAlgo' as keyof Checkpoint, label: 'Algorithm' },
      { key: 'timestamp' as keyof Checkpoint, label: 'Timestamp' },
      { key: 'isVerified' as keyof Checkpoint, label: 'Verified' },
    ];
    
    const csv = arrayToCSV(
      checkpoints.map((c) => ({
        ...c,
        timestamp: new Date(c.timestamp).toISOString(),
        isVerified: c.isVerified ? 'Yes' : 'No',
        signatureAlgo: c.signatureAlgo || 'N/A',
      })),
      columns
    );
    
    downloadCSV(`xase-checkpoints-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handleExportJSON = () => {
    downloadJSON(
      `xase-checkpoints-${new Date().toISOString().split('T')[0]}.json`,
      checkpoints
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search || statusFilter) {
        fetchCheckpoints();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, statusFilter, sortField, sortDir]);

  const hasActiveFilters = !!(search || statusFilter);

  return (
    <div className="space-y-6">
      <TableFilters
        searchPlaceholder="Search by checkpoint ID..."
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            label: 'Status',
            key: 'status',
            value: statusFilter,
            options: [
              { label: 'Verified', value: 'verified' },
              { label: 'Pending', value: 'pending' },
            ],
          },
        ]}
        onFilterChange={handleFilterChange}
        onExportCSV={handleExportCSV}
        onExportJSON={handleExportJSON}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

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
                  <button
                    onClick={() => handleSort('checkpointNumber')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    CHECKPOINT #
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  CHECKPOINT ID
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
                  ALGORITHM
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('timestamp')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    TIMESTAMP
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  STATUS
                </th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp) => (
                <tr
                  key={cp.id}
                  className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-white font-mono">
                    #{cp.checkpointNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80 font-mono">
                    {cp.checkpointId.substring(0, 16)}...
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {cp.recordCount}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {cp.signatureAlgo || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {new Date(cp.timestamp).toLocaleString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        cp.isVerified
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {cp.isVerified ? 'Verified' : 'Pending'}
                    </span>
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
    </div>
  );
}
