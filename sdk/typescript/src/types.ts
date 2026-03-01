/**
 * Type definitions for XASE Sheets SDK
 */

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  dataType: 'AUDIO' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DICOM' | 'TABULAR';
  size: number;
  recordCount?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
}

export interface Lease {
  id: string;
  datasetId: string;
  clientId: string;
  startTime: string;
  endTime: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  accessToken: string;
  purpose?: string;
  metadata?: Record<string, any>;
}

export interface Policy {
  id: string;
  name: string;
  datasetId: string;
  rules: PolicyRules;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRules {
  maxDuration?: number;
  allowedPurposes?: string[];
  requiredApproval?: boolean;
  watermarkRequired?: boolean;
  encryptionRequired?: boolean;
  geofencing?: {
    allowedCountries?: string[];
    blockedCountries?: string[];
  };
  rateLimit?: {
    requestsPerMinute?: number;
    bytesPerMinute?: number;
  };
}

export interface Usage {
  id: string;
  leaseId: string;
  bytesTransferred: number;
  recordsAccessed: number;
  timestamp: string;
  cost?: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  dueDate: string;
  paidAt?: string;
  items: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export type WebhookEvent =
  | 'lease.created'
  | 'lease.expired'
  | 'lease.revoked'
  | 'dataset.created'
  | 'dataset.updated'
  | 'dataset.deleted'
  | 'policy.created'
  | 'policy.expired'
  | 'usage.recorded'
  | 'invoice.created'
  | 'invoice.paid';

export interface Offer {
  id: string;
  datasetId: string;
  dataset: Dataset;
  price: number;
  currency: string;
  description: string;
  terms: string;
  active: boolean;
}

export interface AccessRequest {
  id: string;
  offerId: string;
  requesterId: string;
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  respondedAt?: string;
}

export interface Notification {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  status: 'SUCCESS' | 'FAILED';
  timestamp: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services?: {
    database?: boolean;
    redis?: boolean;
    storage?: boolean;
  };
}
