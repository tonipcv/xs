/**
 * Dataset Catalog Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatasetCatalog } from '@/lib/catalog/dataset-catalog'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dataset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    accessLog: {
      groupBy: vi.fn(),
    },
  },
}))

describe('Dataset Catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('should search datasets with filters', async () => {
      const mockDatasets = [
        {
          id: 'ds1',
          datasetId: 'dataset_1',
          name: 'Test Dataset 1',
          description: 'Description 1',
          language: 'en-US',
          primaryLanguage: 'en-US',
          dataType: 'AUDIO',
          totalDurationHours: 100,
          numRecordings: 1000,
          totalSizeBytes: BigInt(1000000),
          consentStatus: 'VERIFIED_BY_XASE',
          allowedPurposes: ['research', 'training'],
          jurisdiction: 'US',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          avgSnr: 25.5,
          avgSpeechRatio: 0.8,
          avgNoiseLevel: 'LOW',
          tenant: {
            id: 'tenant1',
            name: 'Tenant 1',
          },
        },
      ]

      vi.mocked(prisma.dataset.findMany).mockResolvedValue(mockDatasets as any)
      vi.mocked(prisma.dataset.count).mockResolvedValue(1)

      const result = await DatasetCatalog.search(
        { language: ['en-US'], status: ['ACTIVE'] },
        { page: 1, limit: 20 }
      )

      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].name).toBe('Test Dataset 1')
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)
    })

    it('should apply text search filter', async () => {
      vi.mocked(prisma.dataset.findMany).mockResolvedValue([])
      vi.mocked(prisma.dataset.count).mockResolvedValue(0)

      await DatasetCatalog.search({ searchQuery: 'medical' })

      expect(prisma.dataset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ name: expect.anything() }),
                  expect.objectContaining({ description: expect.anything() }),
                ]),
              }),
            ]),
          }),
        })
      )
    })

    it('should paginate results', async () => {
      vi.mocked(prisma.dataset.findMany).mockResolvedValue([])
      vi.mocked(prisma.dataset.count).mockResolvedValue(100)

      const result = await DatasetCatalog.search({}, { page: 2, limit: 20 })

      expect(result.pagination.page).toBe(2)
      expect(result.pagination.limit).toBe(20)
      expect(result.pagination.total).toBe(100)
      expect(result.pagination.totalPages).toBe(5)
    })

    it('should limit max results per page', async () => {
      vi.mocked(prisma.dataset.findMany).mockResolvedValue([])
      vi.mocked(prisma.dataset.count).mockResolvedValue(0)

      await DatasetCatalog.search({}, { limit: 200 })

      expect(prisma.dataset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Max limit
        })
      )
    })
  })

  describe('getById', () => {
    it('should get dataset by ID', async () => {
      const mockDataset = {
        id: 'ds1',
        datasetId: 'dataset_1',
        name: 'Test Dataset',
        description: 'Description',
        language: 'en-US',
        primaryLanguage: 'en-US',
        dataType: 'AUDIO',
        totalDurationHours: 100,
        numRecordings: 1000,
        totalSizeBytes: BigInt(1000000),
        consentStatus: 'VERIFIED_BY_XASE',
        allowedPurposes: ['research'],
        jurisdiction: 'US',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        avgSnr: 25.5,
        avgSpeechRatio: 0.8,
        avgNoiseLevel: 'LOW',
        tenant: {
          id: 'tenant1',
          name: 'Tenant 1',
        },
      }

      vi.mocked(prisma.dataset.findUnique).mockResolvedValue(mockDataset as any)

      const result = await DatasetCatalog.getById('ds1')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Test Dataset')
      expect(result?._stats?.avgSnr).toBe(25.5)
    })

    it('should return null for non-existent dataset', async () => {
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue(null)

      const result = await DatasetCatalog.getById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getSimilar', () => {
    it('should find similar datasets', async () => {
      const mockSourceDataset = {
        language: 'en-US',
        primaryLanguage: 'en-US',
        dataType: 'AUDIO',
        jurisdiction: 'US',
        allowedPurposes: ['research'],
      }

      const mockSimilarDatasets = [
        {
          id: 'ds2',
          datasetId: 'dataset_2',
          name: 'Similar Dataset',
          description: 'Similar',
          language: 'en-US',
          primaryLanguage: 'en-US',
          dataType: 'AUDIO',
          totalDurationHours: 50,
          numRecordings: 500,
          totalSizeBytes: BigInt(500000),
          consentStatus: 'VERIFIED_BY_XASE',
          allowedPurposes: ['research'],
          jurisdiction: 'US',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          avgSnr: 24.0,
          avgSpeechRatio: 0.75,
          avgNoiseLevel: 'LOW',
          tenant: {
            id: 'tenant2',
            name: 'Tenant 2',
          },
        },
      ]

      vi.mocked(prisma.dataset.findUnique).mockResolvedValue(mockSourceDataset as any)
      vi.mocked(prisma.dataset.findMany).mockResolvedValue(mockSimilarDatasets as any)

      const result = await DatasetCatalog.getSimilar('ds1', 5)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Similar Dataset')
    })

    it('should return empty array if source dataset not found', async () => {
      vi.mocked(prisma.dataset.findUnique).mockResolvedValue(null)

      const result = await DatasetCatalog.getSimilar('nonexistent')

      expect(result).toEqual([])
    })
  })

  describe('getStatistics', () => {
    it('should calculate catalog statistics', async () => {
      const mockDatasets = [
        {
          totalDurationHours: 100,
          numRecordings: 1000,
          totalSizeBytes: BigInt(1000000),
          language: 'en-US',
          dataType: 'AUDIO',
          consentStatus: 'VERIFIED_BY_XASE',
        },
        {
          totalDurationHours: 50,
          numRecordings: 500,
          totalSizeBytes: BigInt(500000),
          language: 'pt-BR',
          dataType: 'AUDIO',
          consentStatus: 'SELF_DECLARED',
        },
      ]

      vi.mocked(prisma.dataset.findMany).mockResolvedValue(mockDatasets as any)

      const stats = await DatasetCatalog.getStatistics()

      expect(stats.totalDatasets).toBe(2)
      expect(stats.totalDurationHours).toBe(150)
      expect(stats.totalRecordings).toBe(1500)
      expect(stats.totalSizeBytes).toBe(BigInt(1500000))
      expect(stats.byLanguage['en-US']).toBe(1)
      expect(stats.byLanguage['pt-BR']).toBe(1)
      expect(stats.byDataType['AUDIO']).toBe(2)
    })
  })

  describe('getTrending', () => {
    it('should get trending datasets', async () => {
      const mockAccessLogs = [
        { datasetId: 'ds1', _count: { id: 100 } },
        { datasetId: 'ds2', _count: { id: 50 } },
      ]

      const mockDatasets = [
        {
          id: 'ds1',
          datasetId: 'dataset_1',
          name: 'Trending Dataset 1',
          description: 'Popular',
          language: 'en-US',
          primaryLanguage: 'en-US',
          dataType: 'AUDIO',
          totalDurationHours: 100,
          numRecordings: 1000,
          totalSizeBytes: BigInt(1000000),
          consentStatus: 'VERIFIED_BY_XASE',
          allowedPurposes: ['research'],
          jurisdiction: 'US',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          avgSnr: 25.5,
          avgSpeechRatio: 0.8,
          avgNoiseLevel: 'LOW',
          tenant: {
            id: 'tenant1',
            name: 'Tenant 1',
          },
        },
      ]

      vi.mocked(prisma.accessLog.groupBy).mockResolvedValue(mockAccessLogs as any)
      vi.mocked(prisma.dataset.findMany).mockResolvedValue(mockDatasets as any)

      const result = await DatasetCatalog.getTrending(10)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Trending Dataset 1')
    })
  })
})
