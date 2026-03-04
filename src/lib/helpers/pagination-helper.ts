/**
 * PAGINATION HELPER
 * Utilities for pagination
 */

export interface PaginationParams {
  page?: number
  limit?: number
  cursor?: string
}

export interface PaginationResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
    nextCursor?: string
    prevCursor?: string
  }
}

export interface CursorPaginationResult<T> {
  data: T[]
  nextCursor?: string
  prevCursor?: string
  hasMore: boolean
}

export class PaginationHelper {
  /**
   * Parse pagination params
   */
  static parseParams(params: URLSearchParams): PaginationParams {
    return {
      page: parseInt(params.get('page') || '1'),
      limit: Math.min(parseInt(params.get('limit') || '20'), 100),
      cursor: params.get('cursor') || undefined,
    }
  }

  /**
   * Create pagination result
   */
  static createResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): PaginationResult<T> {
    const totalPages = Math.ceil(total / limit)

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
    }
  }

  /**
   * Get offset from page
   */
  static getOffset(page: number, limit: number): number {
    return (page - 1) * limit
  }

  /**
   * Create cursor pagination result
   */
  static createCursorResult<T>(
    data: T[],
    limit: number,
    getCursor: (item: T) => string
  ): CursorPaginationResult<T> {
    const hasMore = data.length > limit
    const items = hasMore ? data.slice(0, limit) : data

    return {
      data: items,
      nextCursor: hasMore ? getCursor(items[items.length - 1]) : undefined,
      prevCursor: items.length > 0 ? getCursor(items[0]) : undefined,
      hasMore,
    }
  }

  /**
   * Encode cursor
   */
  static encodeCursor(value: string | number): string {
    return Buffer.from(String(value)).toString('base64')
  }

  /**
   * Decode cursor
   */
  static decodeCursor(cursor: string): string {
    try {
      return Buffer.from(cursor, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }

  /**
   * Get page range
   */
  static getPageRange(
    currentPage: number,
    totalPages: number,
    maxPages: number = 5
  ): number[] {
    const half = Math.floor(maxPages / 2)
    let start = Math.max(1, currentPage - half)
    let end = Math.min(totalPages, start + maxPages - 1)

    if (end - start + 1 < maxPages) {
      start = Math.max(1, end - maxPages + 1)
    }

    const range: number[] = []
    for (let i = start; i <= end; i++) {
      range.push(i)
    }

    return range
  }

  /**
   * Validate pagination params
   */
  static validate(params: PaginationParams): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (params.page !== undefined && params.page !== null && params.page < 1) {
      errors.push('Page must be >= 1')
    }

    if (params.limit !== undefined && params.limit !== null && params.limit < 1) {
      errors.push('Limit must be >= 1')
    }

    if (params.limit !== undefined && params.limit !== null && params.limit > 100) {
      errors.push('Limit must be <= 100')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Calculate total pages
   */
  static calculateTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit)
  }

  /**
   * Check if has next page
   */
  static hasNextPage(page: number, totalPages: number): boolean {
    return page < totalPages
  }

  /**
   * Check if has previous page
   */
  static hasPrevPage(page: number): boolean {
    return page > 1
  }

  /**
   * Get next page number
   */
  static getNextPage(page: number, totalPages: number): number | null {
    return this.hasNextPage(page, totalPages) ? page + 1 : null
  }

  /**
   * Get previous page number
   */
  static getPrevPage(page: number): number | null {
    return this.hasPrevPage(page) ? page - 1 : null
  }
}
