/**
 * Search and Indexing Service
 * Full-text search with filtering and ranking
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface SearchQuery {
  query: string;
  filters?: {
    dataType?: string[];
    language?: string[];
    status?: string[];
    minDuration?: number;
    maxDuration?: number;
    tags?: string[];
  };
  sort?: {
    field: 'relevance' | 'createdAt' | 'updatedAt' | 'name';
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  facets?: Record<string, Record<string, number>>;
}

/**
 * Search datasets with full-text and filters
 */
export async function searchDatasets(
  tenantId: string,
  searchQuery: SearchQuery
): Promise<SearchResult<any>> {
  const { query, filters, sort, pagination } = searchQuery;
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    tenantId,
  };

  // Full-text search
  if (query && query.trim()) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { datasetId: { contains: query, mode: 'insensitive' } },
    ];
  }

  // Apply filters
  if (filters?.dataType && filters.dataType.length > 0) {
    where.dataType = { in: filters.dataType };
  }

  if (filters?.language && filters.language.length > 0) {
    where.language = { in: filters.language };
  }

  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters?.minDuration !== undefined) {
    where.totalDurationHours = { gte: filters.minDuration };
  }

  if (filters?.maxDuration !== undefined) {
    where.totalDurationHours = {
      ...where.totalDurationHours,
      lte: filters.maxDuration,
    };
  }

  // Build order by
  const orderBy: any = {};
  if (sort) {
    if (sort.field === 'relevance') {
      // Relevance sorting would require more complex logic
      orderBy.createdAt = 'desc';
    } else {
      orderBy[sort.field] = sort.order;
    }
  } else {
    orderBy.createdAt = 'desc';
  }

  // Execute search
  const [items, total] = await Promise.all([
    prisma.dataset.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        dataType: true,
        language: true,
        status: true,
        totalDurationHours: true,
        numRecordings: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.dataset.count({ where }),
  ]);

  // Calculate facets
  const facets = await calculateFacets(tenantId, where);

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
    facets,
  };
}

/**
 * Search policies
 */
export async function searchPolicies(
  tenantId: string,
  searchQuery: SearchQuery
): Promise<SearchResult<any>> {
  const { query, pagination } = searchQuery;
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {
    tenantId,
  };

  if (query && query.trim()) {
    where.OR = [
      { policyId: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ];
  }

  const policyLogs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: 'POLICY_CREATED',
      resourceType: 'policy',
      ...(where.OR ? { metadata: { contains: query || '' } } : {}),
    },
    orderBy: { timestamp: 'desc' },
    skip,
    take: limit,
  });

  const items = policyLogs.map((log) => {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    return {
      id: log.resourceId || '',
      policyId: meta?.policyId || log.resourceId || '',
      description: meta?.description || '',
      allowedRegions: meta?.allowedRegions || [],
      allowedPurposes: meta?.allowedPurposes || [],
      maxDurationDays: meta?.maxDurationDays || null,
      requiresApproval: meta?.requiresApproval ?? false,
      isActive: meta?.isActive ?? true,
      createdAt: log.timestamp,
    };
  });

  return {
    items,
    total: items.length,
    page,
    limit,
    hasMore: false,
  };
}

/**
 * Search audit logs
 */
export async function searchAuditLogs(
  tenantId: string,
  searchQuery: SearchQuery & {
    filters?: {
      actions?: string[];
      resourceTypes?: string[];
      status?: string[];
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    };
  }
): Promise<SearchResult<any>> {
  const { query, filters, pagination } = searchQuery;
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const skip = (page - 1) * limit;

  const where: any = {
    tenantId,
  };

  if (query && query.trim()) {
    where.OR = [
      { action: { contains: query, mode: 'insensitive' } },
      { resourceType: { contains: query, mode: 'insensitive' } },
      { resourceId: { contains: query, mode: 'insensitive' } },
    ];
  }

  if (filters?.actions && filters.actions.length > 0) {
    where.action = { in: filters.actions };
  }

  if (filters?.resourceTypes && filters.resourceTypes.length > 0) {
    where.resourceType = { in: filters.resourceTypes };
  }

  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters?.userId) {
    where.userId = filters.userId;
  }

  if (filters?.startDate || filters?.endDate) {
    where.timestamp = {};
    if (filters.startDate) {
      where.timestamp.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.timestamp.lte = filters.endDate;
    }
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        status: true,
        timestamp: true,
        userId: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}

/**
 * Global search across multiple resources
 */
export async function globalSearch(
  tenantId: string,
  query: string,
  limit: number = 10
): Promise<{
  datasets: any[];
  policies: any[];
  leases: any[];
  total: number;
}> {
  if (!query || !query.trim()) {
    return { datasets: [], policies: [], leases: [], total: 0 };
  }

  const [datasets, policyLogs, leases] = await Promise.all([
    prisma.dataset.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { datasetId: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        datasetId: true,
        name: true,
        dataType: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'POLICY_CREATED',
        resourceType: 'policy',
        metadata: { contains: query },
      },
      take: limit,
    }),
    prisma.accessLease.findMany({
      where: {
        OR: [
          { leaseId: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        leaseId: true,
        status: true,
        issuedAt: true,
      },
    }),
  ]);

  const policies = policyLogs.map((log) => {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    return {
      id: log.resourceId || '',
      policyId: meta?.policyId || log.resourceId || '',
      description: meta?.description || '',
    };
  });

  return {
    datasets,
    policies,
    leases,
    total: datasets.length + policies.length + leases.length,
  };
}

/**
 * Calculate search facets for filtering
 */
async function calculateFacets(
  tenantId: string,
  baseWhere: any
): Promise<Record<string, Record<string, number>>> {
  const datasets = await prisma.dataset.findMany({
    where: { ...baseWhere, tenantId },
    select: {
      dataType: true,
      language: true,
      status: true,
    },
  });

  const facets: Record<string, Record<string, number>> = {
    dataType: {},
    language: {},
    status: {},
  };

  for (const dataset of datasets) {
    const dataTypeKey = dataset.dataType || 'UNKNOWN'
    const languageKey = dataset.language || 'UNKNOWN'
    const statusKey = dataset.status || 'UNKNOWN'
    facets.dataType[dataTypeKey] = (facets.dataType[dataTypeKey] || 0) + 1;
    facets.language[languageKey] = (facets.language[languageKey] || 0) + 1;
    facets.status[statusKey] = (facets.status[statusKey] || 0) + 1;
  }

  return facets;
}

/**
 * Get search suggestions (autocomplete)
 */
export async function getSearchSuggestions(
  tenantId: string,
  query: string,
  limit: number = 5
): Promise<string[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const datasets = await prisma.dataset.findMany({
    where: {
      tenantId,
      name: {
        contains: query,
        mode: 'insensitive',
      },
    },
    select: {
      name: true,
    },
    take: limit,
  });

  return datasets.map(d => d.name);
}

/**
 * Index dataset for search (placeholder for future Elasticsearch integration)
 */
export async function indexDataset(datasetId: string): Promise<void> {
  // This would integrate with Elasticsearch or similar
  console.log(`Indexing dataset: ${datasetId}`);
}

/**
 * Remove dataset from search index
 */
export async function removeFromIndex(datasetId: string): Promise<void> {
  console.log(`Removing from index: ${datasetId}`);
}
