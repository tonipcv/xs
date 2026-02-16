import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('Datasets API Integration Tests', () => {
  let testTenantId: string
  let testApiKey: string
  let testDatasetId: string

  beforeAll(async () => {
    // Setup test tenant
    testTenantId = `test_tenant_${Date.now()}`
    
    // Create test API key
    const { hashApiKey } = await import('@/lib/xase/auth')
    testApiKey = `xase_pk_test_${Date.now()}`
    const keyHash = await hashApiKey(testApiKey)
    
    await prisma.apiKey.create({
      data: {
        tenantId: testTenantId,
        name: 'Test API Key',
        keyHash,
        keyPrefix: testApiKey.substring(0, 12),
        isActive: true,
        permissions: 'all',
      },
    })
  })

  afterAll(async () => {
    // Cleanup test data
    await prisma.apiKey.deleteMany({ where: { tenantId: testTenantId } })
    await prisma.dataset.deleteMany({ where: { tenantId: testTenantId } })
  })

  describe('POST /api/v1/datasets', () => {
    it('should create a new dataset with valid API key', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': testApiKey,
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          language: 'en-US',
          description: 'Integration test dataset',
        }),
      })

      expect(response.status).toBe(201)
      const data = await response.json()
      
      expect(data.datasetId).toBeDefined()
      expect(data.name).toBe('Test Dataset')
      expect(data.primaryLanguage).toBe('en-US')
      
      testDatasetId = data.datasetId
    })

    it('should reject request without API key', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Dataset',
          language: 'en-US',
        }),
      })

      expect(response.status).toBe(401)
    })

    it('should reject request with invalid data', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': testApiKey,
        },
        body: JSON.stringify({
          // Missing required fields
          description: 'Invalid dataset',
        }),
      })

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/v1/datasets', () => {
    it('should list datasets for authenticated tenant', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets', {
        headers: {
          'X-API-Key': testApiKey,
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.datasets).toBeDefined()
      expect(Array.isArray(data.datasets)).toBe(true)
      expect(data.datasets.length).toBeGreaterThan(0)
    })

    it('should filter datasets by language', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets?language=en-US', {
        headers: {
          'X-API-Key': testApiKey,
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.datasets.every((d: any) => d.primaryLanguage === 'en-US')).toBe(true)
    })

    it('should respect pagination limit', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets?limit=5', {
        headers: {
          'X-API-Key': testApiKey,
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.datasets.length).toBeLessThanOrEqual(5)
    })
  })

  describe('GET /api/v1/datasets/:datasetId', () => {
    it('should get dataset details', async () => {
      if (!testDatasetId) {
        // Create a dataset first
        const createResponse = await fetch('http://localhost:3000/api/v1/datasets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': testApiKey,
          },
          body: JSON.stringify({
            name: 'Test Dataset for Details',
            language: 'en-US',
          }),
        })
        const createData = await createResponse.json()
        testDatasetId = createData.datasetId
      }

      const response = await fetch(`http://localhost:3000/api/v1/datasets/${testDatasetId}`, {
        headers: {
          'X-API-Key': testApiKey,
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.datasetId).toBe(testDatasetId)
      expect(data.name).toBeDefined()
    })

    it('should return 404 for non-existent dataset', async () => {
      const response = await fetch('http://localhost:3000/api/v1/datasets/ds_nonexistent', {
        headers: {
          'X-API-Key': testApiKey,
        },
      })

      expect(response.status).toBe(404)
    })
  })
})
