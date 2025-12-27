/**
 * Shared utilities for enterprise-grade table operations
 */

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  prevCursor?: string;
  total: number;
  hasMore: boolean;
}

/**
 * Build Prisma orderBy from sort params
 */
export function buildOrderBy(sort?: SortParams) {
  if (!sort) return undefined;
  return { [sort.field]: sort.direction };
}

/**
 * Build date range filter for Prisma where clause
 */
export function buildDateRangeFilter(range?: DateRangeFilter) {
  if (!range) return {};
  const filter: any = {};
  if (range.from) filter.gte = range.from;
  if (range.to) filter.lte = range.to;
  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Parse cursor from base64
 */
export function parseCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Encode cursor to base64
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf-8').toString('base64');
}

/**
 * Convert array to CSV string
 */
export function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[]
): string {
  if (data.length === 0) return '';

  // Header
  const header = columns.map((col) => col.label).join(',');

  // Rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        // Escape commas and quotes
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Trigger browser download of CSV
 */
export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Trigger browser download of JSON
 */
export function downloadJSON(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
