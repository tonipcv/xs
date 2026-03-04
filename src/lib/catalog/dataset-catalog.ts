/**
 * DATASET CATALOG
 * Discovery and search system for datasets
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface DatasetSearchFilters {
  language?: string[]
  dataType?: string[]
  consentStatus?: string[]
  minDurationHours?: number
  maxDurationHours?: number
  minRecordings?: number
  maxRecordings?: number
  jurisdiction?: string[]
  allowedPurposes?: string[]
  status?: string[]
  tenantId?: string
  searchQuery?: string
}

export interface DatasetSearchOptions {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'totalDurationHours' | 'numRecordings' | 'name'
  sortOrder?: 'asc' | 'desc'
}

export interface DatasetCatalogEntry {
  id: string
  datasetId: string
  name: string
  description: string | null
  language: string
  primaryLanguage: string
  dataType: string | null
  totalDurationHours: number
  numRecordings: number
  totalSizeBytes: bigint
  consentStatus: string
  allowedPurposes: string[]
  jurisdiction: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  tenant: {
    id: string
    name: string
  }
  _stats?: {
    avgSnr: number | null
    avgSpeechRatio: number | null
    avgNoiseLevel: string | null
  }
}

export interface DatasetSearchResult {
  datasets: DatasetCatalogEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  facets: {
    languages: Record<string, number>
    dataTypes: Record<string, number>
    consentStatuses: Record<string, number>
    jurisdictions: Record<string, number>
  }
}

/**
 * Dataset Catalog Service
 */
export class DatasetCatalog {
  /**
   * Search datasets with filters and pagination
   */
  static async search(
    filters: DatasetSearchFilters = {},
    options: DatasetSearchOptions = {}
  ): Promise<DatasetSearchResult> {
    const page = options.page || 1
    const limit = Math.min(options.limit || 20, 100)
    const skip = (page - 1) * limit
    const sortBy = options.sortBy || 'createdAt'
    const sortOrder = options.sortOrder || 'desc'

    // Build where clause
    const where: Prisma.DatasetWhereInput = {
      AND: [
        // Status filter
        filters.status && filters.status.length > 0
          ? { status: { in: filters.status as any[] } }
          : { status: { not: 'DELETED' } },
        
        // Tenant filter
        filters.tenantId ? { tenantId: filters.tenantId } : {},
        
        // Language filter
        filters.language && filters.language.length > 0
          ? {
              OR: [
                { language: { in: filters.language } },
                { primaryLanguage: { in: filters.language } },
              ],
            }
          : {},
        
        // Data type filter
        filters.dataType && filters.dataType.length > 0
          ? { dataType: { in: filters.dataType as any[] } }
          : {},
        
        // Consent status filter
        filters.consentStatus && filters.consentStatus.length > 0
          ? { consentStatus: { in: filters.consentStatus as any[] } }
          : {},
        
        // Duration filters
        filters.minDurationHours
          ? { totalDurationHours: { gte: filters.minDurationHours } }
          : {},
        filters.maxDurationHours
          ? { totalDurationHours: { lte: filters.maxDurationHours } }
          : {},
        
        // Recording count filters
        filters.minRecordings
          ? { numRecordings: { gte: filters.minRecordings } }
          : {},
        filters.maxRecordings
          ? { numRecordings: { lte: filters.maxRecordings } }
          : {},
        
        // Jurisdiction filter
        filters.jurisdiction && filters.jurisdiction.length > 0
          ? { jurisdiction: { in: filters.jurisdiction } }
          : {},
        
        // Allowed purposes filter (array overlap)
        filters.allowedPurposes && filters.allowedPurposes.length > 0
          ? { allowedPurposes: { hasSome: filters.allowedPurposes } }
          : {},
        
        // Text search
        filters.searchQuery
          ? {
              OR: [
                { name: { contains: filters.searchQuery, mode: 'insensitive' } },
                { description: { contains: filters.searchQuery, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    }

    // Execute search
    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          datasetId: true,
          name: true,
          description: true,
          language: true,
          primaryLanguage: true,
          dataType: true,
          totalDurationHours: true,
          numRecordings: true,
          totalSizeBytes: true,
          consentStatus: true,
          allowedPurposes: true,
          jurisdiction: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          avgSnr: true,
          avgSpeechRatio: true,
          avgNoiseLevel: true,
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.dataset.count({ where }),
    ])

    // Calculate facets
    const facets = await this.calculateFacets(where)

    return {
      datasets: datasets.map((d) => ({
        ...d,
        _stats: {
          avgSnr: d.avgSnr,
          avgSpeechRatio: d.avgSpeechRatio,
          avgNoiseLevel: d.avgNoiseLevel,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      facets,
    }
  }

  /**
   * Calculate facets for search results
   */
  private static async calculateFacets(
    where: Prisma.DatasetWhereInput
  ): Promise<DatasetSearchResult['facets']> {
    const datasets = await prisma.dataset.findMany({
      where,
      select: {
        language: true,
        primaryLanguage: true,
        dataType: true,
        consentStatus: true,
        jurisdiction: true,
      },
    })

    const facets = {
      languages: {} as Record<string, number>,
      dataTypes: {} as Record<string, number>,
      consentStatuses: {} as Record<string, number>,
      jurisdictions: {} as Record<string, number>,
    }

    for (const dataset of datasets) {
      // Language facets
      if (dataset.language) {
        facets.languages[dataset.language] = (facets.languages[dataset.language] || 0) + 1
      }
      if (dataset.primaryLanguage && dataset.primaryLanguage !== dataset.language) {
        facets.languages[dataset.primaryLanguage] = (facets.languages[dataset.primaryLanguage] || 0) + 1
      }

      // Data type facets
      if (dataset.dataType) {
        facets.dataTypes[dataset.dataType] = (facets.dataTypes[dataset.dataType] || 0) + 1
      }

      // Consent status facets
      facets.consentStatuses[dataset.consentStatus] = (facets.consentStatuses[dataset.consentStatus] || 0) + 1

      // Jurisdiction facets
      if (dataset.jurisdiction) {
        facets.jurisdictions[dataset.jurisdiction] = (facets.jurisdictions[dataset.jurisdiction] || 0) + 1
      }
    }

    return facets
  }

  /**
   * Get dataset by ID with full details
   */
  static async getById(datasetId: string): Promise<DatasetCatalogEntry | null> {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        language: true,
        primaryLanguage: true,
        dataType: true,
        totalDurationHours: true,
        numRecordings: true,
        totalSizeBytes: true,
        consentStatus: true,
        allowedPurposes: true,
        jurisdiction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        avgSnr: true,
        avgSpeechRatio: true,
        avgNoiseLevel: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!dataset) return null

    return {
      ...dataset,
      _stats: {
        avgSnr: dataset.avgSnr,
        avgSpeechRatio: dataset.avgSpeechRatio,
        avgNoiseLevel: dataset.avgNoiseLevel,
      },
    }
  }

  /**
   * Get similar datasets based on characteristics
   */
  static async getSimilar(
    datasetId: string,
    limit: number = 5
  ): Promise<DatasetCatalogEntry[]> {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      select: {
        language: true,
        primaryLanguage: true,
        dataType: true,
        jurisdiction: true,
        allowedPurposes: true,
      },
    })

    if (!dataset) return []

    // Find similar datasets
    const similar = await prisma.dataset.findMany({
      where: {
        id: { not: datasetId },
        status: 'ACTIVE',
        OR: [
          { language: dataset.language },
          { primaryLanguage: dataset.primaryLanguage },
          { dataType: dataset.dataType },
          { jurisdiction: dataset.jurisdiction },
          dataset.allowedPurposes.length > 0
            ? { allowedPurposes: { hasSome: dataset.allowedPurposes } }
            : {},
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        language: true,
        primaryLanguage: true,
        dataType: true,
        totalDurationHours: true,
        numRecordings: true,
        totalSizeBytes: true,
        consentStatus: true,
        allowedPurposes: true,
        jurisdiction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        avgSnr: true,
        avgSpeechRatio: true,
        avgNoiseLevel: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return similar.map((d) => ({
      ...d,
      _stats: {
        avgSnr: d.avgSnr,
        avgSpeechRatio: d.avgSpeechRatio,
        avgNoiseLevel: d.avgNoiseLevel,
      },
    }))
  }

  /**
   * Get catalog statistics
   */
  static async getStatistics(): Promise<{
    totalDatasets: number
    totalDurationHours: number
    totalRecordings: number
    totalSizeBytes: bigint
    byLanguage: Record<string, number>
    byDataType: Record<string, number>
    byConsentStatus: Record<string, number>
  }> {
    const datasets = await prisma.dataset.findMany({
      where: { status: { not: 'DELETED' } },
      select: {
        totalDurationHours: true,
        numRecordings: true,
        totalSizeBytes: true,
        language: true,
        dataType: true,
        consentStatus: true,
      },
    })

    const stats = {
      totalDatasets: datasets.length,
      totalDurationHours: 0,
      totalRecordings: 0,
      totalSizeBytes: BigInt(0),
      byLanguage: {} as Record<string, number>,
      byDataType: {} as Record<string, number>,
      byConsentStatus: {} as Record<string, number>,
    }

    for (const dataset of datasets) {
      stats.totalDurationHours += dataset.totalDurationHours
      stats.totalRecordings += dataset.numRecordings
      stats.totalSizeBytes += dataset.totalSizeBytes

      stats.byLanguage[dataset.language] = (stats.byLanguage[dataset.language] || 0) + 1
      
      if (dataset.dataType) {
        stats.byDataType[dataset.dataType] = (stats.byDataType[dataset.dataType] || 0) + 1
      }
      
      stats.byConsentStatus[dataset.consentStatus] = (stats.byConsentStatus[dataset.consentStatus] || 0) + 1
    }

    return stats
  }

  /**
   * Get trending datasets (most accessed recently)
   */
  static async getTrending(limit: number = 10): Promise<DatasetCatalogEntry[]> {
    // Get datasets with recent access logs
    const recentAccess = await prisma.accessLog.groupBy({
      by: ['datasetId'],
      _count: { id: true },
      where: {
        timestamp: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: {
        _count: { id: 'desc' },
      },
      take: limit,
    })

    const datasetIds = recentAccess.map((r) => r.datasetId)

    const datasets = await prisma.dataset.findMany({
      where: {
        id: { in: datasetIds },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        language: true,
        primaryLanguage: true,
        dataType: true,
        totalDurationHours: true,
        numRecordings: true,
        totalSizeBytes: true,
        consentStatus: true,
        allowedPurposes: true,
        jurisdiction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        avgSnr: true,
        avgSpeechRatio: true,
        avgNoiseLevel: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return datasets.map((d) => ({
      ...d,
      _stats: {
        avgSnr: d.avgSnr,
        avgSpeechRatio: d.avgSpeechRatio,
        avgNoiseLevel: d.avgNoiseLevel,
      },
    }))
  }
}
