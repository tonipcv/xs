'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TablePaginationProps {
  hasMore: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  currentPage?: number;
  totalItems?: number;
}

export function TablePagination({
  hasMore,
  hasPrev,
  onNext,
  onPrev,
  currentPage,
  totalItems,
}: TablePaginationProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08]">
      <div className="text-xs text-white/50">
        {totalItems !== undefined && `${totalItems.toLocaleString()} total items`}
        {currentPage !== undefined && ` • Page ${currentPage}`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={!hasPrev}
          className="border-white/15 text-white/80 hover:bg-white/[0.06] disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasMore}
          className="border-white/15 text-white/80 hover:bg-white/[0.06] disabled:opacity-30"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
