'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TableFilters } from '@/components/TableFilters';
import { TablePagination } from '@/components/TablePagination';
import { arrayToCSV, downloadCSV, downloadJSON } from '@/lib/table-utils';
// removed icons for minimalist UI
 

interface Record {
  id: string;
  transactionId: string;
  policyId: string | null;
  decisionType?: string | null;
  confidence: number | null;
  isVerified: boolean;
  timestamp: string | Date;
  recordHash?: string;
  insuranceDecision: {
    claimNumber: string | null;
    claimType: string | null;
    claimAmount: any | null;
    policyNumber: string | null;
    decisionOutcome: string | null;
    decisionImpactConsumerImpact: string | null;
  } | null;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  type FilterSnapshot = {
    search?: string;
    policy?: string;
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    claimType?: string;
    consumerImpact?: string;
    sortField?: string;
    sortDir?: 'asc' | 'desc';
  };
  const [records, setRecords] = useState<Record[]>(initialRecords);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);

  // Calculate legal risk level
  const getRiskLevel = (record: Record): 'high' | 'medium' | 'low' => {
    const confidence = record.confidence || 0;
    const impact = record.insuranceDecision?.decisionImpactConsumerImpact;
    
    // High risk: low confidence + high impact
    if (confidence < 0.7 && impact === 'HIGH') return 'high';
    // Medium risk: low confidence OR high impact
    if (confidence < 0.7 || impact === 'HIGH') return 'medium';
    return 'low';
  };

  const getRiskBadge = (level: 'high' | 'medium' | 'low') => {
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded border bg-white/[0.02] text-white/75 border-white/[0.08] uppercase font-medium tracking-wide`}>
        {level}
      </span>
    );
  };
  
  // Filters
  const [search, setSearch] = useState('');
  const [policyFilter, setPolicyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [claimTypeFilter, setClaimTypeFilter] = useState('');
  const [consumerImpactFilter, setConsumerImpactFilter] = useState('');
  
  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(initialRecords.length >= 20);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<string>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Initialize state from URL on mount (one-time)
  useEffect(() => {
    if (!searchParams) return;
    const sp = searchParams;
    const get = (k: string) => sp.get(k) || '';
    const sf = sp.get('sortField');
    const sd = sp.get('sortDir') as 'asc' | 'desc' | null;
    setSearch(get('search'));
    setPolicyFilter(get('policy'));
    setTypeFilter(get('type'));
    setStatusFilter(get('status'));
    setDateFrom(get('from'));
    setDateTo(get('to'));
    setClaimTypeFilter(get('claimType'));
    setConsumerImpactFilter(get('consumerImpact'));
    if (sf) setSortField(sf);
    if (sd === 'asc' || sd === 'desc') setSortDir(sd);
    const c = sp.get('cursor') || undefined;
    setCursor(c || undefined);

    // If there are filters present in URL, fetch immediately with that snapshot
    const snapshot: FilterSnapshot = {
      search: get('search') || undefined,
      policy: get('policy') || undefined,
      type: get('type') || undefined,
      status: get('status') || undefined,
      from: get('from') || undefined,
      to: get('to') || undefined,
      claimType: get('claimType') || undefined,
      consumerImpact: get('consumerImpact') || undefined,
      sortField: (sf || 'timestamp') as string,
      sortDir: (sd || 'desc') as 'asc' | 'desc',
    };
    const anyFilter = Object.values(snapshot).some(Boolean);
    if (anyFilter) {
      fetchRecords(undefined, 'next', snapshot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build URL with a provided snapshot of filters (no cursor)
  const buildUrl = (snapshot?: FilterSnapshot) => {
    const params = new URLSearchParams();
    const s = snapshot || {};
    const v = (k: string, val: any) => (val ? params.set(k, String(val)) : undefined);
    v('search', s.search ?? search);
    v('policy', s.policy ?? policyFilter);
    v('type', s.type ?? typeFilter);
    v('status', s.status ?? statusFilter);
    v('from', s.from ?? dateFrom);
    v('to', s.to ?? dateTo);
    v('claimType', s.claimType ?? claimTypeFilter);
    v('consumerImpact', s.consumerImpact ?? consumerImpactFilter);
    v('sortField', s.sortField ?? sortField);
    v('sortDir', s.sortDir ?? sortDir);
    const qs = params.toString();
    return qs ? `/xase/records?${qs}` : '/xase/records';
  };

  // Get unique policies and types for filters
  const uniquePolicies = Array.from(
    new Set(initialRecords.map((r) => r.policyId).filter(Boolean))
  );
  const uniqueTypes = Array.from(
    new Set(initialRecords.map((r) => r.decisionType).filter(Boolean))
  );

  const fetchRecords = async (newCursor?: string, direction: 'next' | 'prev' = 'next', snapshot?: FilterSnapshot) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newCursor) params.set('cursor', newCursor);
      const s = snapshot || {};
      const sval = (k: string, val: any) => { if (val) params.set(k, String(val)); };
      sval('search', s.search ?? search);
      sval('policy', s.policy ?? policyFilter);
      sval('type', s.type ?? typeFilter);
      sval('status', s.status ?? statusFilter);
      sval('from', s.from ?? dateFrom);
      sval('to', s.to ?? dateTo);
      sval('claimType', s.claimType ?? claimTypeFilter);
      sval('consumerImpact', s.consumerImpact ?? consumerImpactFilter);
      params.set('sortField', (s.sortField ?? sortField) as string);
      params.set('sortDir', (s.sortDir ?? sortDir) as 'asc' | 'desc');

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

  const handleFilterChange = (
    key: string,
    value: string
  ) => {
    // Build next snapshot and fetch immediately
    const snapshot: FilterSnapshot = {
      search,
      policy: policyFilter,
      type: typeFilter,
      status: statusFilter,
      from: dateFrom,
      to: dateTo,
      claimType: claimTypeFilter,
      consumerImpact: consumerImpactFilter,
      sortField,
      sortDir,
    };
    switch (key) {
      case 'policy':
        snapshot.policy = value;
        break;
      case 'type':
        snapshot.type = value;
        break;
      case 'status':
        snapshot.status = value;
        break;
      case 'claimType':
        snapshot.claimType = value;
        break;
      case 'consumerImpact':
        snapshot.consumerImpact = value;
        break;
      case 'from':
        snapshot.from = value;
        setDateFrom(value);
        break;
      case 'to':
        snapshot.to = value;
        setDateTo(value);
        break;
      default:
        // ignore unknown keys
        break;
    }
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    // Update local state
    if (key === 'policy') setPolicyFilter(value);
    if (key === 'type') setTypeFilter(value);
    if (key === 'status') setStatusFilter(value);
    if (key === 'claimType') setClaimTypeFilter(value);
    if (key === 'consumerImpact') setConsumerImpactFilter(value);
    // Update URL and fetch
    router.replace(buildUrl(snapshot));
    fetchRecords(undefined, 'next', snapshot);
  };

  // Date changes handled via onFilterChange ('from' | 'to')

  // Debounced search only
  const searchTimer = useRef<any>(null);
  const handleSearch = (value: string) => {
    setSearch(value);
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const snapshot: FilterSnapshot = {
        search: value,
        policy: policyFilter,
        type: typeFilter,
        status: statusFilter,
        from: dateFrom,
        to: dateTo,
        claimType: claimTypeFilter,
        consumerImpact: consumerImpactFilter,
        sortField,
        sortDir,
      };
      router.replace(buildUrl(snapshot));
      fetchRecords(undefined, 'next', snapshot);
    }, 300);
  };

  const handleClearFilters = () => {
    setSearch('');
    setPolicyFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setClaimTypeFilter('');
    setConsumerImpactFilter('');
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    router.replace('/xase/records');
    fetchRecords();
  };

  const handleSort = (field: string) => {
    const newDir = sortField === field && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortDir(newDir);
    setCursor(undefined);
    setHistory([]);
    setPage(1);
    const snapshot: FilterSnapshot = {
      search,
      policy: policyFilter,
      type: typeFilter,
      status: statusFilter,
      from: dateFrom,
      to: dateTo,
      claimType: claimTypeFilter,
      consumerImpact: consumerImpactFilter,
      sortField: field,
      sortDir: newDir,
    };
    router.replace(buildUrl(snapshot));
    fetchRecords(undefined, 'next', snapshot);
  };

  // Clear debounce on unmount
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

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

  // Remove global debounced effect; fetching is driven by handlers above.

  const hasActiveFilters = !!(search || policyFilter || typeFilter || statusFilter || dateFrom || dateTo || claimTypeFilter || consumerImpactFilter);

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
          {
            label: 'Claim Type',
            key: 'claimType',
            value: claimTypeFilter,
            options: [
              { label: 'Auto', value: 'AUTO' },
              { label: 'Health', value: 'HEALTH' },
              { label: 'Life', value: 'LIFE' },
              { label: 'Property', value: 'PROPERTY' },
              { label: 'Liability', value: 'LIABILITY' },
              { label: 'Travel', value: 'TRAVEL' },
            ],
          },
          {
            label: 'Consumer Impact',
            key: 'consumerImpact',
            value: consumerImpactFilter,
            options: [
              { label: 'Low', value: 'LOW' },
              { label: 'Medium', value: 'MEDIUM' },
              { label: 'High', value: 'HIGH' },
            ],
          },
          {
            label: 'From',
            key: 'from',
            type: 'datetime',
            value: dateFrom,
          },
          {
            label: 'To',
            key: 'to',
            type: 'datetime',
            value: dateTo,
          },
        ]}
        onFilterChange={handleFilterChange}
        onExportCSV={handleExportCSV}
        onExportJSON={handleExportJSON}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  RISK
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  DECISION
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  AMOUNT
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  <button
                    onClick={() => handleSort('timestamp')}
                    className="hover:text-white/70 underline underline-offset-2"
                  >
                    DATE
                  </button>
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  PROOF STATUS
                </th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/70 tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const riskLevel = getRiskLevel(record);
                const amount = record.insuranceDecision?.claimAmount;
                const formattedAmount = amount ? `£${parseFloat(amount).toLocaleString('en-GB')}` : 'N/A';
                
                return (
                  <tr
                    key={record.id}
                    className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                  >
                    {/* RISK COLUMN - Visual priority */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        {getRiskBadge(riskLevel)}
                        <div className="flex gap-1">
                          {record.isVerified && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.02] text-white/55 border border-white/[0.08] uppercase font-medium tracking-wide">
                              PROOF
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* DECISION COLUMN - What happened */}
                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {record.insuranceDecision?.decisionOutcome ? (
                            <span className={`text-[11px] px-2 py-0.5 rounded border font-medium bg-white/[0.02] text-white/70 border-white/[0.08]`}>
                              {record.insuranceDecision.decisionOutcome === 'APPROVED' ? 'Approved' : 
                               record.insuranceDecision.decisionOutcome === 'REJECTED' ? 'Rejected' : 
                               'Review'}
                            </span>
                          ) : null}
                          {record.insuranceDecision?.claimType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.02] text-white/70 border border-white/[0.08]">
                              {record.insuranceDecision.claimType}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/60 font-mono">
                          {record.insuranceDecision?.claimNumber || record.transactionId.substring(0, 16)}
                        </p>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-white/50">Conf</span>
                          <span className={`font-medium text-white/70`}>
                            {record.confidence ? (record.confidence * 100).toFixed(0) + '%' : 'N/A'}
                          </span>
                          {record.insuranceDecision?.decisionImpactConsumerImpact && (
                            <>
                              <span className="text-white/40">·</span>
                              <span className="text-white/50">Impact</span>
                              <span className={`font-medium text-white/70`}>
                                {record.insuranceDecision.decisionImpactConsumerImpact}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* AMOUNT COLUMN */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-white/90 font-medium">{formattedAmount}</p>
                    </td>

                    {/* DATE COLUMN */}
                    <td className="px-6 py-4 text-xs text-white/70">
                      {new Date(record.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* PROOF STATUS COLUMN */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {record.isVerified ? (
                          <span className="text-[10px] text-white/80 font-medium">Verified</span>
                        ) : (
                          <span className="text-[10px] text-white/60 font-medium">Pending</span>
                        )}
                        <span className="text-[9px] text-white/25 font-mono">
                          {record.recordHash?.substring(0, 12)}...
                        </span>
                      </div>
                    </td>

                    {/* ACTIONS COLUMN */}
                    <td className="px-6 py-4">
                      <a
                        href={`/xase/records/${record.transactionId}`}
                        className="inline-flex items-center px-3 py-1.5 border border-white/12 bg-transparent text-white/85 rounded text-xs font-medium hover:bg-white/[0.04] hover:border-white/20 transition-colors"
                      >
                        Investigate
                      </a>
                    </td>
                  </tr>
                );
              })}
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
