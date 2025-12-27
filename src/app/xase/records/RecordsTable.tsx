'use client';

import { useState, useEffect } from 'react';
import { TableFilters } from '@/components/TableFilters';
import { TablePagination } from '@/components/TablePagination';
import { arrayToCSV, downloadCSV, downloadJSON } from '@/lib/table-utils';
import { ArrowUpDown } from 'lucide-react';

interface Record {
  id: string;
  transactionId: string;
  policyId: string | null;
  decisionType: string | null;
  confidence: number | null;
  isVerified: boolean;
  timestamp: Date;
}

interface RecordsTableProps {
  initialRecords: Record[];
  initialTotal: number;
  tenantId: string;
}

export function RecordsTable({
  initialRecords,
  initialTotal,
  tenantId,
}: RecordsTableProps) {
  const [records, setRecords] = useState<Record[]>(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [policyFilter, setPolicyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(initialRecords.length >= 20);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<string>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Get unique policies and types for filters
  const uniquePolicies = Array.from(
    new Set(initialRecords.map((r) => r.policyId).filter(Boolean))
  );
  const uniqueTypes = Array.from(
    new Set(initialRecords.map((r) => r.decisionType).filter(Boolean))
  );

  const fetchRecords = async (newCursor?: string, direction: 'next' | 'prev' = 'next') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newCursor) params.set('cursor', newCursor);
      if (search) params.set('search', search);
      if (policyFilter) params.set('policy', policyFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('sortField', sortField);
      params.set('sortDir', sortDir);

      const res = await fetch(`/api/xase/records?${params.toString()}`);
      const data = await res.json();

      setRecords(data.records);
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
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (hasMore && cursor) {
      fetchRecords(cursor, 'next');
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevCursor = history[history.length - 1];
      fetchRecords(prevCursor, 'prev');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    
    switch (key) {
      case 'policy':
        setPolicyFilter(value);
        break;
      case 'type':
        setTypeFilter(value);
        break;
      case 'status':
        setStatusFilter(value);
        break;
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
    setPolicyFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    fetchRecords();
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
      { key: 'transactionId' as keyof Record, label: 'Transaction ID' },
      { key: 'policyId' as keyof Record, label: 'Policy' },
      { key: 'decisionType' as keyof Record, label: 'Type' },
      { key: 'confidence' as keyof Record, label: 'Confidence' },
      { key: 'timestamp' as keyof Record, label: 'Timestamp' },
      { key: 'isVerified' as keyof Record, label: 'Verified' },
    ];
    
    const csv = arrayToCSV(
      records.map((r) => ({
        ...r,
        confidence: r.confidence ? (r.confidence * 100).toFixed(1) + '%' : 'N/A',
        timestamp: new Date(r.timestamp).toISOString(),
        isVerified: r.isVerified ? 'Yes' : 'No',
      })),
      columns
    );
    
    downloadCSV(`xase-records-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handleExportJSON = () => {
    downloadJSON(
      `xase-records-${new Date().toISOString().split('T')[0]}.json`,
      records
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search || policyFilter || typeFilter || statusFilter || dateFrom || dateTo) {
        fetchRecords();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, policyFilter, typeFilter, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  const hasActiveFilters = !!(search || policyFilter || typeFilter || statusFilter || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      <TableFilters
        searchPlaceholder="Search by transaction ID..."
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            label: 'Policy',
            key: 'policy',
            value: policyFilter,
            options: uniquePolicies.map((p) => ({ label: p!, value: p! })),
          },
          {
            label: 'Type',
            key: 'type',
            value: typeFilter,
            options: uniqueTypes.map((t) => ({ label: t!, value: t! })),
          },
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
                  TRANSACTION ID
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('policyId')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    POLICY
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('decisionType')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    TYPE
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  <button
                    onClick={() => handleSort('confidence')}
                    className="flex items-center gap-1 hover:text-white/70"
                  >
                    CONFIDENCE
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
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
                <th className="text-left px-6 py-4 text-xs font-medium text-white/50 tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-white font-mono">
                    {record.transactionId.substring(0, 16)}...
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {record.policyId || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {record.decisionType || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {record.confidence
                      ? (record.confidence * 100).toFixed(1) + '%'
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/80">
                    {new Date(record.timestamp).toLocaleString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        record.isVerified
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {record.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={`/xase/records/${record.transactionId}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors"
                    >
                      View Details
                    </a>
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
