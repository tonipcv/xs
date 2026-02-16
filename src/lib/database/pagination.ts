/**
 * Database Pagination Utilities
 * 
 * Provides safe pagination for all database queries to prevent OOM
 */

import { Prisma } from '@prisma/client';

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    cursor?: string;
  };
}

export interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    limit: number;
    hasNext: boolean;
    nextCursor?: string;
  };
}

/**
 * Default pagination limits
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Validate and normalize pagination parameters
 */
export function normalizePagination(params: PaginationParams): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(
    Math.max(1, params.limit || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Create paginated query with offset-based pagination
 * 
 * Usage:
 * const result = await paginateQuery(
 *   prisma.dataset,
 *   { page: 1, limit: 20 },
 *   { where: { tenantId: 'xxx' }, orderBy: { createdAt: 'desc' } }
 * );
 */
export async function paginateQuery<T, A>(
  model: {
    findMany: (args: A) => Promise<T[]>;
    count: (args: { where?: any }) => Promise<number>;
  },
  params: PaginationParams,
  queryArgs: A & { where?: any }
): Promise<PaginationResult<T>> {
  const { page, limit, skip } = normalizePagination(params);

  // Execute query with pagination
  const [data, total] = await Promise.all([
    model.findMany({
      ...queryArgs,
      take: limit,
      skip,
    } as A),
    model.count({ where: queryArgs.where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Create paginated query with cursor-based pagination
 * More efficient for large datasets
 * 
 * Usage:
 * const result = await paginateCursor(
 *   prisma.auditLog,
 *   { limit: 20, cursor: 'log_123' },
 *   { where: { tenantId: 'xxx' }, orderBy: { createdAt: 'desc' } },
 *   'id'
 * );
 */
export async function paginateCursor<T extends Record<string, any>, A>(
  model: {
    findMany: (args: A) => Promise<T[]>;
  },
  params: PaginationParams,
  queryArgs: A,
  cursorField: keyof T
): Promise<CursorPaginationResult<T>> {
  const limit = Math.min(
    Math.max(1, params.limit || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  // Fetch one extra to check if there's a next page
  const data = await model.findMany({
    ...queryArgs,
    take: limit + 1,
    ...(params.cursor
      ? {
          cursor: { [cursorField]: params.cursor },
          skip: 1, // Skip the cursor itself
        }
      : {}),
  } as A);

  const hasNext = data.length > limit;
  const results = hasNext ? data.slice(0, limit) : data;
  const nextCursor = hasNext ? String(results[results.length - 1][cursorField]) : undefined;

  return {
    data: results,
    pagination: {
      limit,
      hasNext,
      nextCursor,
    },
  };
}

/**
 * Safe findMany wrapper that always applies pagination
 * Prevents accidental queries without limits
 */
export function safeFindMany<T, A extends { take?: number; skip?: number }>(
  findMany: (args: A) => Promise<T[]>,
  args: A
): Promise<T[]> {
  // If no take is specified, apply default limit
  if (!args.take) {
    return findMany({
      ...args,
      take: DEFAULT_PAGE_SIZE,
    });
  }

  // If take exceeds max, cap it
  if (args.take > MAX_PAGE_SIZE) {
    return findMany({
      ...args,
      take: MAX_PAGE_SIZE,
    });
  }

  return findMany(args);
}
