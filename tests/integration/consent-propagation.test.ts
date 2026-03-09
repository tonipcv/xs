/**
 * Integration tests for consent propagation
 * 
 * Tests that consent revocation propagates across the system in < 60s
 */

import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { ConsentManager } from '@/lib/xase/consent-manager';
import { Redis } from 'ioredis';
import { prisma } from '@/lib/prisma';

describe('Consent Propagation Integration Tests', () => {
  let consentManager: ConsentManager;
  let redis: Redis;
  let testTenantId: string;
  let testDatasetId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize Redis
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    // Create test data
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        email: `test-tenant-${Date.now()}@example.com`,
      },
    });
    testTenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        tenantId: testTenantId,
      },
    });
    testUserId = user.id;

    const dataset = await prisma.dataset.create({
      data: {
        datasetId: `test-dataset-${Date.now()}`,
        tenantId: testTenantId,
        name: 'Test Dataset',
        storageLocation: 's3://test-bucket',
        language: 'en',
      },
    });
    testDatasetId = dataset.id;

    consentManager = new ConsentManager();
  });

  afterAll(async () => {
    // Cleanup
    await prisma.dataset.delete({ where: { id: testDatasetId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.tenant.delete({ where: { id: testTenantId } });
    await redis.quit();
  });

  test('Consent revocation propagates via Redis Streams', async () => {
    // Subscribe to revocation stream
    const receivedEvents: any[] = [];
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    const subscriptionPromise = new Promise<void>((resolve) => {
      subscriber.xread(
        'BLOCK', '5000',
        'STREAMS', 'consent:revocations', '0',
        (err, streams) => {
          if (streams) {
            for (const stream of streams) {
              for (const message of stream[1]) {
                const data = message[1];
                const event = {
                  tenantId: data[1],
                  datasetId: data[3],
                  userId: data[5],
                };
                receivedEvents.push(event);
              }
            }
          }
          resolve();
        }
      );
    });

    // Revoke consent
    await consentManager.revokeConsent(testTenantId, testDatasetId, testUserId);

    // Wait for propagation
    await subscriptionPromise;
    await subscriber.quit();

    // Verify event was received
    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(receivedEvents[0]).toMatchObject({
      tenantId: testTenantId,
      datasetId: testDatasetId,
      userId: testUserId,
    });
  }, 10000);

  test('Consent status is cached and invalidated', async () => {
    // Grant consent
    await consentManager.grantConsent(testTenantId, testDatasetId, testUserId, ['TRAINING']);

    // Check status (should be cached)
    const status1 = await consentManager.checkConsent(testTenantId, testDatasetId, testUserId);
    expect(status1.hasConsent).toBe(true);

    // Revoke consent
    await consentManager.revokeConsent(testTenantId, testDatasetId, testUserId);

    // Wait for cache invalidation (< 60s)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check status again (cache should be invalidated)
    const status2 = await consentManager.checkConsent(testTenantId, testDatasetId, testUserId);
    expect(status2.hasConsent).toBe(false);
  }, 65000);

  test('Multiple subscribers receive revocation events', async () => {
    const subscriber1 = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const subscriber2 = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    const received1: any[] = [];
    const received2: any[] = [];

    // Subscribe both
    const promise1 = new Promise<void>((resolve) => {
      subscriber1.xread(
        'BLOCK', '5000',
        'STREAMS', 'consent:revocations', '0',
        (err, streams) => {
          if (streams) {
            for (const stream of streams) {
              for (const message of stream[1]) {
                received1.push(message);
              }
            }
          }
          resolve();
        }
      );
    });

    const promise2 = new Promise<void>((resolve) => {
      subscriber2.xread(
        'BLOCK', '5000',
        'STREAMS', 'consent:revocations', '0',
        (err, streams) => {
          if (streams) {
            for (const stream of streams) {
              for (const message of stream[1]) {
                received2.push(message);
              }
            }
          }
          resolve();
        }
      );
    });

    // Revoke consent
    await consentManager.revokeConsent(testTenantId, testDatasetId, testUserId);

    // Wait for both subscribers
    await Promise.all([promise1, promise2]);
    
    await subscriber1.quit();
    await subscriber2.quit();

    // Both should receive the event
    expect(received1.length).toBeGreaterThan(0);
    expect(received2.length).toBeGreaterThan(0);
  }, 10000);

  test('Propagation completes within 30 seconds (p95)', async () => {
    const startTime = Date.now();

    // Revoke consent
    await consentManager.revokeConsent(testTenantId, testDatasetId, testUserId);

    // Wait for cache invalidation
    let propagated = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (!propagated && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      // Check if revocation is reflected
      const status = await consentManager.checkConsent(testTenantId, testDatasetId, testUserId);
      if (!status.hasConsent) {
        propagated = true;
      }
    }

    const duration = Date.now() - startTime;

    expect(propagated).toBe(true);
    expect(duration).toBeLessThan(30000); // Should complete in < 30s
  }, 65000);

  test('Consent revocation propagates to access decisions', async () => {
    // Grant consent first
    await consentManager.grantConsent(testTenantId, testDatasetId, testUserId, ['TRAINING']);

    // Verify consent is granted
    const statusBefore = await consentManager.checkConsent(testTenantId, testDatasetId, testUserId);
    expect(statusBefore.hasConsent).toBe(true);

    // Revoke consent
    await consentManager.revokeConsent(testTenantId, testDatasetId, testUserId);

    // Wait for propagation (< 60s as per spec)
    const startTime = Date.now();
    let propagated = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!propagated && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      // Check if revocation is reflected
      const status = await consentManager.checkConsent(testTenantId, testDatasetId, testUserId);
      if (!status.hasConsent) {
        propagated = true;
      }
    }

    const duration = Date.now() - startTime;

    expect(propagated).toBe(true);
    expect(duration).toBeLessThan(30000); // Should complete in < 30s
  }, 65000);

  test('Bulk revocations propagate efficiently', async () => {
    const numRevocations = 10;
    const startTime = Date.now();

    // Create multiple test users
    const userIds: string[] = [];
    for (let i = 0; i < numRevocations; i++) {
      const user = await prisma.user.create({
        data: {
          email: `bulk-test-${Date.now()}-${i}@example.com`,
          name: `Bulk Test User ${i}`,
          tenantId: testTenantId,
        },
      });
      userIds.push(user.id);
    }

    // Revoke all
    await Promise.all(
      userIds.map(userId =>
        consentManager.revokeConsent(testTenantId, testDatasetId, userId)
      )
    );

    const duration = Date.now() - startTime;

    // Should complete in reasonable time (< 5s for 10 revocations)
    expect(duration).toBeLessThan(5000);

    // Cleanup
    await Promise.all(
      userIds.map(userId => prisma.user.delete({ where: { id: userId } }))
    );
  }, 10000);
});
