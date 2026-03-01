/**
 * Tests for XASE Sheets TypeScript SDK
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import XaseClient from '../index';
import axios from 'axios';

vi.mock('axios');

describe('XaseClient', () => {
  let client: XaseClient;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.xase.ai';

  beforeEach(() => {
    client = new XaseClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
    });
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct config', () => {
      expect(client).toBeDefined();
      expect(client['apiKey']).toBe(mockApiKey);
      expect(client['baseUrl']).toBe(mockBaseUrl);
    });

    it('should use default base URL if not provided', () => {
      const defaultClient = new XaseClient({ apiKey: mockApiKey });
      expect(defaultClient['baseUrl']).toBe('https://api.xase.ai');
    });
  });

  describe('Datasets', () => {
    it('should list datasets', async () => {
      const mockResponse = {
        data: {
          datasets: [
            { id: 'ds_1', name: 'Dataset 1', dataType: 'AUDIO' },
            { id: 'ds_2', name: 'Dataset 2', dataType: 'TEXT' },
          ],
          total: 2,
        },
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await client.listDatasets();
      expect(result.datasets).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should get dataset by ID', async () => {
      const mockDataset = {
        id: 'ds_1',
        name: 'Test Dataset',
        dataType: 'AUDIO',
        size: 1024000,
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockDataset }),
      } as any);

      const result = await client.getDataset('ds_1');
      expect(result.id).toBe('ds_1');
      expect(result.name).toBe('Test Dataset');
    });

    it('should create dataset', async () => {
      const mockDataset = {
        id: 'ds_new',
        name: 'New Dataset',
        dataType: 'AUDIO',
        size: 0,
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockDataset }),
      } as any);

      const result = await client.createDataset({
        name: 'New Dataset',
        dataType: 'AUDIO',
      });

      expect(result.id).toBe('ds_new');
      expect(result.name).toBe('New Dataset');
    });

    it('should update dataset', async () => {
      const mockDataset = {
        id: 'ds_1',
        name: 'Updated Dataset',
        dataType: 'AUDIO',
      };

      vi.mocked(axios.create).mockReturnValue({
        patch: vi.fn().mockResolvedValue({ data: mockDataset }),
      } as any);

      const result = await client.updateDataset('ds_1', {
        name: 'Updated Dataset',
      });

      expect(result.name).toBe('Updated Dataset');
    });

    it('should delete dataset', async () => {
      vi.mocked(axios.create).mockReturnValue({
        delete: vi.fn().mockResolvedValue({}),
      } as any);

      await expect(client.deleteDataset('ds_1')).resolves.toBeUndefined();
    });
  });

  describe('Leases', () => {
    it('should create lease', async () => {
      const mockLease = {
        id: 'lease_1',
        datasetId: 'ds_1',
        accessToken: 'token_123',
        status: 'ACTIVE',
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockLease }),
      } as any);

      const result = await client.createLease({
        datasetId: 'ds_1',
        duration: 3600,
      });

      expect(result.id).toBe('lease_1');
      expect(result.accessToken).toBe('token_123');
    });

    it('should get lease by ID', async () => {
      const mockLease = {
        id: 'lease_1',
        datasetId: 'ds_1',
        status: 'ACTIVE',
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockLease }),
      } as any);

      const result = await client.getLease('lease_1');
      expect(result.id).toBe('lease_1');
    });

    it('should list leases', async () => {
      const mockResponse = {
        data: {
          leases: [
            { id: 'lease_1', status: 'ACTIVE' },
            { id: 'lease_2', status: 'EXPIRED' },
          ],
          total: 2,
        },
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await client.listLeases();
      expect(result.leases).toHaveLength(2);
    });

    it('should revoke lease', async () => {
      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({}),
      } as any);

      await expect(client.revokeLease('lease_1')).resolves.toBeUndefined();
    });

    it('should renew lease', async () => {
      const mockLease = {
        id: 'lease_1',
        status: 'ACTIVE',
        endTime: new Date(Date.now() + 7200000).toISOString(),
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockLease }),
      } as any);

      const result = await client.renewLease('lease_1', 7200);
      expect(result.id).toBe('lease_1');
    });
  });

  describe('Policies', () => {
    it('should create policy', async () => {
      const mockPolicy = {
        id: 'policy_1',
        name: 'Test Policy',
        datasetId: 'ds_1',
        rules: { maxDuration: 3600 },
        active: true,
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockPolicy }),
      } as any);

      const result = await client.createPolicy({
        name: 'Test Policy',
        datasetId: 'ds_1',
        rules: { maxDuration: 3600 },
      });

      expect(result.id).toBe('policy_1');
      expect(result.name).toBe('Test Policy');
    });

    it('should get policy by ID', async () => {
      const mockPolicy = {
        id: 'policy_1',
        name: 'Test Policy',
        active: true,
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockPolicy }),
      } as any);

      const result = await client.getPolicy('policy_1');
      expect(result.id).toBe('policy_1');
    });

    it('should list policies', async () => {
      const mockResponse = {
        data: {
          policies: [
            { id: 'policy_1', active: true },
            { id: 'policy_2', active: false },
          ],
          total: 2,
        },
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await client.listPolicies();
      expect(result.policies).toHaveLength(2);
    });
  });

  describe('Usage Tracking', () => {
    it('should record usage', async () => {
      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({}),
      } as any);

      await expect(
        client.recordUsage({
          leaseId: 'lease_1',
          bytesTransferred: 1024000,
          recordsAccessed: 100,
        })
      ).resolves.toBeUndefined();
    });

    it('should get usage statistics', async () => {
      const mockUsage = [
        {
          id: 'usage_1',
          leaseId: 'lease_1',
          bytesTransferred: 1024000,
          recordsAccessed: 100,
        },
      ];

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockUsage }),
      } as any);

      const result = await client.getUsage();
      expect(result).toHaveLength(1);
      expect(result[0].bytesTransferred).toBe(1024000);
    });
  });

  describe('Marketplace', () => {
    it('should list offers', async () => {
      const mockResponse = {
        data: {
          offers: [
            { id: 'offer_1', price: 100 },
            { id: 'offer_2', price: 200 },
          ],
        },
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await client.listOffers();
      expect(result.offers).toHaveLength(2);
    });

    it('should get offer by ID', async () => {
      const mockOffer = {
        id: 'offer_1',
        price: 100,
        currency: 'USD',
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockOffer }),
      } as any);

      const result = await client.getOffer('offer_1');
      expect(result.id).toBe('offer_1');
      expect(result.price).toBe(100);
    });

    it('should request access', async () => {
      const mockRequest = {
        id: 'request_1',
        offerId: 'offer_1',
        status: 'PENDING',
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockRequest }),
      } as any);

      const result = await client.requestAccess({
        offerId: 'offer_1',
        purpose: 'Research',
      });

      expect(result.id).toBe('request_1');
      expect(result.status).toBe('PENDING');
    });

    it('should search marketplace', async () => {
      const mockResults = {
        data: {
          results: [
            { id: 'ds_1', name: 'Dataset 1' },
            { id: 'ds_2', name: 'Dataset 2' },
          ],
        },
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResults),
      } as any);

      const result = await client.searchMarketplace('audio');
      expect(result.results).toHaveLength(2);
    });
  });

  describe('Webhooks', () => {
    it('should create webhook', async () => {
      const mockWebhook = {
        id: 'webhook_1',
        url: 'https://example.com/webhook',
        events: ['lease.created'],
        active: true,
      };

      vi.mocked(axios.create).mockReturnValue({
        post: vi.fn().mockResolvedValue({ data: mockWebhook }),
      } as any);

      const result = await client.createWebhook({
        url: 'https://example.com/webhook',
        events: ['lease.created'],
      });

      expect(result.id).toBe('webhook_1');
      expect(result.url).toBe('https://example.com/webhook');
    });

    it('should list webhooks', async () => {
      const mockWebhooks = [
        { id: 'webhook_1', active: true },
        { id: 'webhook_2', active: false },
      ];

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockWebhooks }),
      } as any);

      const result = await client.listWebhooks();
      expect(result).toHaveLength(2);
    });

    it('should delete webhook', async () => {
      vi.mocked(axios.create).mockReturnValue({
        delete: vi.fn().mockResolvedValue({}),
      } as any);

      await expect(client.deleteWebhook('webhook_1')).resolves.toBeUndefined();
    });
  });

  describe('Health Check', () => {
    it('should check API health', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };

      vi.mocked(axios.create).mockReturnValue({
        get: vi.fn().mockResolvedValue({ data: mockHealth }),
      } as any);

      const result = await client.health();
      expect(result.status).toBe('healthy');
    });
  });
});
