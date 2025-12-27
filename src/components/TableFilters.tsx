'use client';

import { useState } from 'react';
import { Search, Filter, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FilterOption {
  label: string;
  value: string;
}

interface TableFiltersProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: {
    label: string;
    key: string;
    options: FilterOption[];
    value?: string;
  }[];
  onFilterChange?: (key: string, value: string) => void;
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}

export function TableFilters({
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  filters = [],
  onFilterChange,
  onExportCSV,
  onExportJSON,
  onClearFilters,
  hasActiveFilters = false,
}: TableFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {/* Search */}
        {onSearchChange && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 bg-white/[0.03] border-white/[0.08] text-white placeholder-white/40"
            />
          </div>
        )}

        {/* Filter Toggle */}
        {filters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`border-white/15 text-white/80 hover:bg-white/[0.06] ${
              hasActiveFilters ? 'bg-white/[0.06]' : ''
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <span className="ml-2 w-2 h-2 rounded-full bg-blue-400" />
            )}
          </Button>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-white/60 hover:text-white/80 hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Export Actions */}
        <div className="ml-auto flex items-center gap-2">
          {onExportCSV && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCSV}
              className="border-white/15 text-white/80 hover:bg-white/[0.06]"
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          )}
          {onExportJSON && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportJSON}
              className="border-white/15 text-white/80 hover:bg-white/[0.06]"
            >
              <Download className="w-4 h-4 mr-2" />
              JSON
            </Button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && filters.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-white/[0.02] border border-white/[0.08] rounded-lg">
          {filters.map((filter) => (
            <div key={filter.key}>
              <label className="block text-xs text-white/60 mb-1.5">
                {filter.label}
              </label>
              <select
                value={filter.value || ''}
                onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white/[0.03] border border-white/[0.08] rounded text-white outline-none focus:border-white/[0.15]"
              >
                <option value="">All</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
