'use client';

import { useState, useEffect } from 'react';
import { TableFilters } from '@/components/TableFilters';
import { TablePagination } from '@/components/TablePagination';
import { arrayToCSV, downloadCSV, downloadJSON } from '@/lib/table-utils';
import { ArrowUpDown } from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  status: string;
  timestamp: Date;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface AuditTableProps {
  initialLogs: AuditLog[];
  initialTotal: number;
  tenantId: string;
}

export function AuditTable({
  initialLogs,
  initialTotal,
  tenantId,
}: AuditTableProps) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(initialLogs.length >= 20);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<string>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Get unique values for filters
  const uniqueActions = Array.from(
    new Set(initialLogs.map((l) => l.action))
  );
  const uniqueResourceTypes = Array.from(
    new Set(initialLogs.map((l) => l.resourceType))
  );

  const fetchLogs = async (newCursor?: string, direction: 'next' | 'prev' = 'next') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newCursor) params.set('cursor', newCursor);
      if (search) params.set('search', search);
      if (actionFilter) params.set('action', actionFilter);
      if (resourceTypeFilter) params.set('resourceType', resourceTypeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('sortField', sortField);
      params.set('sortDir', sortDir);

      const res = await fetch(`/api/xase/audit?${params.toString()}`);
      const data = await res.json();

      setLogs(data.logs);
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
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (hasMore && cursor) {
      fetchLogs(cursor, 'next');
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevCursor = history[history.length - 1];
      fetchLogs(prevCursor, 'prev');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    
    switch (key) {
      case 'action':
        setActionFilter(value);
        break;
      case 'resourceType':
        setResourceTypeFilter(value);
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
    setActionFilter('');
    setResourceTypeFilter('');
    setStatusFilter('');
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    fetchLogs();
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
      { key: 'action' as keyof AuditLog, label: 'Action' },
      { key: 'resourceType' as keyof AuditLog, label: 'Resource Type' },
      { key: 'resourceId' as keyof AuditLog, label: 'Resource ID' },
      { key: 'status' as keyof AuditLog, label: 'Status' },
      { key: 'timestamp' as keyof AuditLog, label: 'Timestamp' },
      { key: 'userId' as keyof AuditLog, label: 'User' },
      { key: 'ipAddress' as keyof AuditLog, label: 'IP' },
      { key: 'userAgent' as keyof AuditLog, label: 'User Agent' },
    ];
    
    const csv = arrayToCSV(
      logs.map((l) => ({
        ...l,
        timestamp: new Date(l.timestamp).toISOString(),
      })),
      columns
    );
    
    downloadCSV(`xase-audit-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const handleExportJSON = () => {
    downloadJSON(
      `xase-audit-${new Date().toISOString().split('T')[0]}.json`,
      logs
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search || actionFilter || resourceTypeFilter || statusFilter) {
        fetchLogs();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, actionFilter, resourceTypeFilter, statusFilter, sortField, sortDir]);

  const hasActiveFilters = !!(search || actionFilter || resourceTypeFilter || statusFilter);

  return (
    <div className="space-y-6">
      <TableFilters
        searchPlaceholder="Search by resource ID..."
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            label: 'Action',
            key: 'action',
            value: actionFilter,
            options: uniqueActions.map((a) => ({ label: a, value: a })),
          },
          {
            label: 'Resource Type',
            key: 'resourceType',
            value: resourceTypeFilter,
            options: uniqueResourceTypes.map((t) => ({ label: t, value: t })),
          },
          {
            label: 'Status',
            key: 'status',
            value: statusFilter,
            options: [
              { label: 'Success', value: 'SUCCESS' },
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

      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">
                  <button
                    onClick={() => handleSort('action')}
                    className="flex items-center gap-1 hover:text-white/50"
                  >
                    Action
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">
                  <button
                    onClick={() => handleSort('resourceType')}
                    className="flex items-center gap-1 hover:text-white/50"
                  >
                    Resource Type
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">
                  Resource ID
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">User</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">IP</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">User Agent</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">
                  <button
                    onClick={() => handleSort('timestamp')}
                    className="flex items-center gap-1 hover:text-white/50"
                  >
                    Timestamp
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 tracking-wider uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-white/80">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/60">
                    {log.resourceType}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/50 font-mono">
                    {log.resourceId.substring(0, 16)}...
                  </td>
                  <td className="px-6 py-4 text-sm text-white/50 font-mono">
                    {log.userId || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/50 font-mono">
                    {log.ipAddress || '—'}
                  </td>
                  <td className="px-6 py-4 text-xs text-white/50 truncate max-w-[220px]" title={log.userAgent || ''}>
                    {log.userAgent || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/60">
                    {new Date(log.timestamp).toLocaleString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-500/5 text-emerald-400/80 border-emerald-500/20'
                          : 'bg-rose-500/5 text-rose-400/80 border-rose-500/20'
                      }`}
                    >
                      {log.status}
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
