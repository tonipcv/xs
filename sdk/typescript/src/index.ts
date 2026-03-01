/**
 * XASE Sheets SDK - TypeScript/JavaScript
 * Official SDK for interacting with XASE Sheets API
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import WebSocket from 'ws';

export interface XaseConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  dataType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lease {
  id: string;
  datasetId: string;
  startTime: string;
  endTime: string;
  status: string;
  accessToken: string;
}

export interface Policy {
  id: string;
  name: string;
  datasetId: string;
  rules: any;
  active: boolean;
}

export interface Usage {
  leaseId: string;
  bytesTransferred: number;
  recordsAccessed: number;
  timestamp: string;
}

export class XaseClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: XaseConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.xase.ai';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'xase-sdk-typescript/2.0.0',
      },
    });
  }

  // ==================== Datasets ====================

  /**
   * List all datasets
   */
  async listDatasets(params?: {
    page?: number;
    limit?: number;
    dataType?: string;
  }): Promise<{ datasets: Dataset[]; total: number }> {
    const response = await this.client.get('/api/datasets', { params });
    return response.data;
  }

  /**
   * Get dataset by ID
   */
  async getDataset(id: string): Promise<Dataset> {
    const response = await this.client.get(`/api/datasets/${id}`);
    return response.data;
  }

  /**
   * Create new dataset
   */
  async createDataset(data: {
    name: string;
    description?: string;
    dataType: string;
    tags?: string[];
  }): Promise<Dataset> {
    const response = await this.client.post('/api/datasets', data);
    return response.data;
  }

  /**
   * Update dataset
   */
  async updateDataset(id: string, data: Partial<Dataset>): Promise<Dataset> {
    const response = await this.client.patch(`/api/datasets/${id}`, data);
    return response.data;
  }

  /**
   * Delete dataset
   */
  async deleteDataset(id: string): Promise<void> {
    await this.client.delete(`/api/datasets/${id}`);
  }

  // ==================== Leases ====================

  /**
   * Create lease for dataset access
   */
  async createLease(data: {
    datasetId: string;
    duration?: number;
    purpose?: string;
  }): Promise<Lease> {
    const response = await this.client.post('/api/leases', data);
    return response.data;
  }

  /**
   * Get lease by ID
   */
  async getLease(id: string): Promise<Lease> {
    const response = await this.client.get(`/api/leases/${id}`);
    return response.data;
  }

  /**
   * List all leases
   */
  async listLeases(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ leases: Lease[]; total: number }> {
    const response = await this.client.get('/api/leases', { params });
    return response.data;
  }

  /**
   * Revoke lease
   */
  async revokeLease(id: string): Promise<void> {
    await this.client.post(`/api/leases/${id}/revoke`);
  }

  /**
   * Renew lease
   */
  async renewLease(id: string, duration?: number): Promise<Lease> {
    const response = await this.client.post(`/api/leases/${id}/renew`, { duration });
    return response.data;
  }

  // ==================== Policies ====================

  /**
   * Create access policy
   */
  async createPolicy(data: {
    name: string;
    datasetId: string;
    rules: any;
  }): Promise<Policy> {
    const response = await this.client.post('/api/policies', data);
    return response.data;
  }

  /**
   * Get policy by ID
   */
  async getPolicy(id: string): Promise<Policy> {
    const response = await this.client.get(`/api/policies/${id}`);
    return response.data;
  }

  /**
   * List policies
   */
  async listPolicies(params?: {
    datasetId?: string;
    active?: boolean;
  }): Promise<{ policies: Policy[]; total: number }> {
    const response = await this.client.get('/api/policies', { params });
    return response.data;
  }

  /**
   * Update policy
   */
  async updatePolicy(id: string, data: Partial<Policy>): Promise<Policy> {
    const response = await this.client.patch(`/api/policies/${id}`, data);
    return response.data;
  }

  /**
   * Delete policy
   */
  async deletePolicy(id: string): Promise<void> {
    await this.client.delete(`/api/policies/${id}`);
  }

  // ==================== Usage Tracking ====================

  /**
   * Record usage
   */
  async recordUsage(data: {
    leaseId: string;
    bytesTransferred: number;
    recordsAccessed: number;
  }): Promise<void> {
    await this.client.post('/api/billing/usage', data);
  }

  /**
   * Get usage statistics
   */
  async getUsage(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<Usage[]> {
    const response = await this.client.get('/api/billing/usage', { params });
    return response.data;
  }

  // ==================== Marketplace ====================

  /**
   * List marketplace offers
   */
  async listOffers(params?: {
    page?: number;
    limit?: number;
    dataType?: string;
  }): Promise<any> {
    const response = await this.client.get('/api/marketplace/offers', { params });
    return response.data;
  }

  /**
   * Get offer details
   */
  async getOffer(id: string): Promise<any> {
    const response = await this.client.get(`/api/marketplace/offers/${id}`);
    return response.data;
  }

  /**
   * Request access to dataset
   */
  async requestAccess(data: {
    offerId: string;
    purpose: string;
  }): Promise<any> {
    const response = await this.client.post('/api/marketplace/request', data);
    return response.data;
  }

  /**
   * Search marketplace
   */
  async searchMarketplace(query: string, params?: any): Promise<any> {
    const response = await this.client.get('/api/marketplace/search', {
      params: { q: query, ...params },
    });
    return response.data;
  }

  // ==================== Webhooks ====================

  /**
   * Create webhook
   */
  async createWebhook(data: {
    url: string;
    events: string[];
    secret?: string;
  }): Promise<any> {
    const response = await this.client.post('/api/webhooks', data);
    return response.data;
  }

  /**
   * List webhooks
   */
  async listWebhooks(): Promise<any> {
    const response = await this.client.get('/api/webhooks');
    return response.data;
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(id: string): Promise<void> {
    await this.client.delete(`/api/webhooks/${id}`);
  }

  // ==================== Real-time Notifications ====================

  /**
   * Connect to real-time notifications via WebSocket
   */
  connectNotifications(onMessage: (data: any) => void): WebSocket {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/ws/notifications`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        onMessage(parsed);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return ws;
  }

  // ==================== Health & Status ====================

  /**
   * Check API health
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/api/health');
    return response.data;
  }
}

// Export types
export * from './types';

// Default export
export default XaseClient;
