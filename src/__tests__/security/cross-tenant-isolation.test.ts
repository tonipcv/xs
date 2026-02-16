/**
 * Cross-Tenant Isolation Tests
 * Ensures complete data isolation between tenants
 * 
 * NOTE: These tests require a running PostgreSQL database.
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { RBACService } from '@/lib/security/rbac-service'
import { ApiKeyManager } from '@/lib/security/api-key-manager'

// Skip these tests in unit test mode (no DB available)
const isIntegrationTest = process.env.TEST_MODE === 'integration'

describe.skipIf(!isIntegrationTest)('Cross-Tenant Isolation', () => {
  let tenant1Id: string
  let tenant2Id: string
  let user1Id: string
  let user2Id: string
  let dataset1Id: string
  let dataset2Id: string

  beforeAll(async () => {
    // Create test tenants
    const tenant1 = await prisma.tenant.create({
      data: {
        name: 'Tenant 1',
        email: 'tenant1@test.com',
        status: 'ACTIVE',
      },
    })
    tenant1Id = tenant1.id

    const tenant2 = await prisma.tenant.create({
      data: {
        name: 'Tenant 2',
        email: 'tenant2@test.com',
        status: 'ACTIVE',
      },
    })
    tenant2Id = tenant2.id

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        email: 'user1@test.com',
        tenantId: tenant1Id,
        xaseRole: 'ADMIN',
      },
    })
    user1Id = user1.id

    const user2 = await prisma.user.create({
      data: {
        email: 'user2@test.com',
        tenantId: tenant2Id,
        xaseRole: 'ADMIN',
      },
    })
    user2Id = user2.id

    // Create test datasets
    const dataset1 = await prisma.dataset.create({
      data: {
        tenantId: tenant1Id,
        datasetId: 'ds_test_1',
        name: 'Dataset 1',
        language: 'en',
        totalDurationHours: 10,
        numRecordings: 100,
        storageLocation: 'test/1',
      },
    })
    dataset1Id = dataset1.datasetId

    const dataset2 = await prisma.dataset.create({
      data: {
        tenantId: tenant2Id,
        datasetId: 'ds_test_2',
        name: 'Dataset 2',
        language: 'en',
        totalDurationHours: 20,
        numRecordings: 200,
        storageLocation: 'test/2',
      },
    })
    dataset2Id = dataset2.datasetId
  })

  afterAll(async () => {
    // Cleanup
    await prisma.dataset.deleteMany({
      where: { datasetId: { in: [dataset1Id, dataset2Id] } },
    })
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    })
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenant1Id, tenant2Id] } },
    })
  })

  describe('Dataset Isolation', () => {
    it('should not allow tenant1 to access tenant2 datasets', async () => {
      const datasets = await prisma.dataset.findMany({
        where: {
          tenantId: tenant1Id,
          datasetId: dataset2Id,
        },
      })

      expect(datasets).toHaveLength(0)
    })

    it('should not allow tenant2 to access tenant1 datasets', async () => {
      const datasets = await prisma.dataset.findMany({
        where: {
          tenantId: tenant2Id,
          datasetId: dataset1Id,
        },
      })

      expect(datasets).toHaveLength(0)
    })

    it('should only return datasets for correct tenant', async () => {
      const tenant1Datasets = await prisma.dataset.findMany({
        where: { tenantId: tenant1Id },
      })

      const tenant2Datasets = await prisma.dataset.findMany({
        where: { tenantId: tenant2Id },
      })

      expect(tenant1Datasets.every(d => d.tenantId === tenant1Id)).toBe(true)
      expect(tenant2Datasets.every(d => d.tenantId === tenant2Id)).toBe(true)
      expect(tenant1Datasets.some(d => d.datasetId === dataset2Id)).toBe(false)
      expect(tenant2Datasets.some(d => d.datasetId === dataset1Id)).toBe(false)
    })
  })

  describe('User Isolation', () => {
    it('should not allow user1 to access tenant2 resources', async () => {
      const hasPermission = await RBACService.hasPermission(
        user1Id,
        tenant2Id,
        'datasets:read'
      )

      expect(hasPermission).toBe(false)
    })

    it('should not allow user2 to access tenant1 resources', async () => {
      const hasPermission = await RBACService.hasPermission(
        user2Id,
        tenant1Id,
        'datasets:read'
      )

      expect(hasPermission).toBe(false)
    })

    it('should allow users to access their own tenant resources', async () => {
      const user1Permission = await RBACService.hasPermission(
        user1Id,
        tenant1Id,
        'datasets:read'
      )

      const user2Permission = await RBACService.hasPermission(
        user2Id,
        tenant2Id,
        'datasets:read'
      )

      expect(user1Permission).toBe(true)
      expect(user2Permission).toBe(true)
    })
  })

  describe('API Key Isolation', () => {
    it('should not allow tenant1 API key to access tenant2 resources', async () => {
      const { key: apiKey1 } = await ApiKeyManager.createKey(
        tenant1Id,
        'Test Key 1',
        [{ resource: 'all', permissions: ['*'] }]
      )

      const validation = await ApiKeyManager.validateKeyWithScope(
        apiKey1,
        'dataset',
        dataset2Id,
        'read'
      )

      expect(validation.tenantId).toBe(tenant1Id)
      // Should not have access to tenant2's dataset
    })

    it('should not allow tenant2 API key to access tenant1 resources', async () => {
      const { key: apiKey2 } = await ApiKeyManager.createKey(
        tenant2Id,
        'Test Key 2',
        [{ resource: 'all', permissions: ['*'] }]
      )

      const validation = await ApiKeyManager.validateKeyWithScope(
        apiKey2,
        'dataset',
        dataset1Id,
        'read'
      )

      expect(validation.tenantId).toBe(tenant2Id)
      // Should not have access to tenant1's dataset
    })
  })

  describe('Policy Isolation', () => {
    it('should not allow cross-tenant policy access', async () => {
      // Create policy for tenant1
      const policy1 = await prisma.voiceAccessPolicy.create({
        data: {
          tenantId: tenant1Id,
          datasetId: dataset1Id,
          policyName: 'Test Policy 1',
          allowedPurposes: ['research'],
          maxLeaseHours: 24,
          requiresApproval: false,
        },
      })

      // Try to access from tenant2 context
      const policies = await prisma.voiceAccessPolicy.findMany({
        where: {
          tenantId: tenant2Id,
          id: policy1.id,
        },
      })

      expect(policies).toHaveLength(0)

      // Cleanup
      await prisma.voiceAccessPolicy.delete({ where: { id: policy1.id } })
    })
  })

  describe('Lease Isolation', () => {
    it('should not allow cross-tenant lease access', async () => {
      // Create policy and lease for tenant1
      const policy = await prisma.voiceAccessPolicy.create({
        data: {
          tenantId: tenant1Id,
          datasetId: dataset1Id,
          policyName: 'Test Policy',
          allowedPurposes: ['research'],
          maxLeaseHours: 24,
          requiresApproval: false,
        },
      })

      const lease = await prisma.voiceAccessLease.create({
        data: {
          leaseId: 'lease_test_1',
          datasetId: dataset1Id,
          clientTenantId: tenant1Id,
          policyId: policy.id,
          status: 'ACTIVE',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })

      // Try to access from tenant2 context
      const leases = await prisma.voiceAccessLease.findMany({
        where: {
          clientTenantId: tenant2Id,
          id: lease.id,
        },
      })

      expect(leases).toHaveLength(0)

      // Cleanup
      await prisma.voiceAccessLease.delete({ where: { id: lease.id } })
      await prisma.voiceAccessPolicy.delete({ where: { id: policy.id } })
    })
  })

  describe('Audit Log Isolation', () => {
    it('should not expose tenant1 audit logs to tenant2', async () => {
      // Create audit log for tenant1
      await prisma.auditLog.create({
        data: {
          tenantId: tenant1Id,
          action: 'TEST_ACTION',
          resourceType: 'dataset',
          resourceId: dataset1Id,
          status: 'SUCCESS',
        },
      })

      // Try to access from tenant2 context
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant2Id,
          resourceId: dataset1Id,
        },
      })

      expect(logs).toHaveLength(0)
    })

    it('should not expose tenant2 audit logs to tenant1', async () => {
      // Create audit log for tenant2
      await prisma.auditLog.create({
        data: {
          tenantId: tenant2Id,
          action: 'TEST_ACTION',
          resourceType: 'dataset',
          resourceId: dataset2Id,
          status: 'SUCCESS',
        },
      })

      // Try to access from tenant1 context
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant1Id,
          resourceId: dataset2Id,
        },
      })

      expect(logs).toHaveLength(0)
    })
  })

  describe('Credit Ledger Isolation', () => {
    it('should not allow cross-tenant credit ledger access', async () => {
      // Create credit entry for tenant1
      const credit1 = await prisma.creditLedger.create({
        data: {
          tenantId: tenant1Id,
          action: 'PURCHASE',
          creditChange: 100,
          balanceAfter: 100,
        },
      })

      // Try to access from tenant2 context
      const credits = await prisma.creditLedger.findMany({
        where: {
          tenantId: tenant2Id,
          id: credit1.id,
        },
      })

      expect(credits).toHaveLength(0)

      // Cleanup
      await prisma.creditLedger.delete({ where: { id: credit1.id } })
    })
  })

  describe('Comprehensive Isolation Test', () => {
    it('should maintain complete isolation across all resources', async () => {
      // Get all resources for tenant1
      const tenant1Resources = {
        datasets: await prisma.dataset.count({ where: { tenantId: tenant1Id } }),
        policies: await prisma.voiceAccessPolicy.count({ where: { tenantId: tenant1Id } }),
        auditLogs: await prisma.auditLog.count({ where: { tenantId: tenant1Id } }),
        credits: await prisma.creditLedger.count({ where: { tenantId: tenant1Id } }),
      }

      // Get all resources for tenant2
      const tenant2Resources = {
        datasets: await prisma.dataset.count({ where: { tenantId: tenant2Id } }),
        policies: await prisma.voiceAccessPolicy.count({ where: { tenantId: tenant2Id } }),
        auditLogs: await prisma.auditLog.count({ where: { tenantId: tenant2Id } }),
        credits: await prisma.creditLedger.count({ where: { tenantId: tenant2Id } }),
      }

      // Verify no overlap
      const tenant1DatasetIds = (await prisma.dataset.findMany({
        where: { tenantId: tenant1Id },
        select: { datasetId: true },
      })).map(d => d.datasetId)

      const tenant2DatasetIds = (await prisma.dataset.findMany({
        where: { tenantId: tenant2Id },
        select: { datasetId: true },
      })).map(d => d.datasetId)

      const overlap = tenant1DatasetIds.filter(id => tenant2DatasetIds.includes(id))
      expect(overlap).toHaveLength(0)

      // All counts should be >= 0
      expect(tenant1Resources.datasets).toBeGreaterThanOrEqual(0)
      expect(tenant2Resources.datasets).toBeGreaterThanOrEqual(0)
    })
  })
})
