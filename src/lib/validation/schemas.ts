/**
 * Centralized Zod Validation Schemas
 * 
 * All API input validation schemas in one place for consistency
 */

import { z } from 'zod';

// ============================================
// Common Schemas
// ============================================

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ============================================
// Dataset Schemas
// ============================================

export const CreateDatasetSchema = z.object({
  name: z.string().min(1).max(255),
  language: z.string().min(2).max(10),
  description: z.string().max(2000).optional(),
  storageLocation: z.string().min(1).optional(),
  region: z.string().optional(),
  integrationMode: z.enum([
    'aws-s3',
    'gcs',
    'azure-blob',
    'snowflake',
    'bigquery',
    'postgres',
  ]).optional(),
  integrationId: z.string().optional(),
});

export const UpdateDatasetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  language: z.string().min(2).max(10).optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const DatasetQuerySchema = PaginationSchema.extend({
  status: z.enum(['DRAFT', 'PROCESSING', 'PUBLISHED', 'ARCHIVED']).optional(),
  language: z.string().optional(),
  search: z.string().optional(),
});

// ============================================
// Access Policy Schemas
// ============================================

export const CreatePolicySchema = z.object({
  datasetId: z.string().min(1),
  clientTenantId: z.string().min(1),
  canStream: z.boolean().default(true),
  canDownload: z.boolean().default(false),
  canExport: z.boolean().default(false),
  maxConcurrentStreams: z.number().int().min(1).max(1000).default(10),
  maxRequestsPerHour: z.number().int().min(1).max(100000).default(1000),
  allowedRegions: z.array(z.string()).optional(),
  deniedRegions: z.array(z.string()).optional(),
  requireWatermark: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

export const UpdatePolicySchema = CreatePolicySchema.partial();

// ============================================
// Lease Schemas
// ============================================

export const CreateLeaseSchema = z.object({
  policyId: z.string().min(1),
  ttlSeconds: z.number().int().min(60).max(86400 * 30).default(3600),
  metadata: z.record(z.any()).optional(),
});

export const LeaseQuerySchema = PaginationSchema.extend({
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']).optional(),
  datasetId: z.string().optional(),
});

// ============================================
// Sidecar Schemas
// ============================================

export const SidecarAuthSchema = z.object({
  leaseId: z.string().min(1),
  attestationReport: z.string().optional(),
  binaryHash: z.string().optional(),
});

export const SidecarTelemetryLogSchema = z.object({
  segmentId: z.string(),
  timestamp: z.string().datetime(),
  eventType: z.enum([
    'download',
    'watermark',
    'serve',
    'cache_hit',
    'cache_miss',
    'error',
  ]),
  bytesProcessed: z.number().int().min(0).optional(),
  latencyMs: z.number().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

export const SidecarTelemetrySchema = z.object({
  sessionId: z.string().min(1),
  logs: z.array(SidecarTelemetryLogSchema).min(1).max(1000),
});

export const KillSwitchSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

// ============================================
// API Key Schemas
// ============================================

export const RequestOTPSchema = z.object({
  purpose: z.string().min(1).max(255).optional(),
});

export const ConfirmOTPSchema = z.object({
  otp: z.string().length(6),
  name: z.string().min(1).max(255),
  permissions: z.array(z.enum(['ingest', 'export', 'verify', 'intervene'])).optional(),
});

// ============================================
// Upload Schemas
// ============================================

export const UploadMetadataSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().min(1).max(1024 * 1024 * 1024 * 10), // Max 10GB
  duration: z.number().min(0).optional(),
  sampleRate: z.number().int().min(8000).max(192000).optional(),
  channels: z.number().int().min(1).max(8).optional(),
});

// ============================================
// Evidence Schemas
// ============================================

export const GenerateEvidenceSchema = z.object({
  executionId: z.string().min(1),
  includeAuditLogs: z.boolean().default(true),
  includeMerkleTree: z.boolean().default(true),
  includeLegalCertificate: z.boolean().default(true),
  includeTimestamp: z.boolean().default(true),
});

// ============================================
// Compliance Schemas
// ============================================

export const DSARRequestSchema = z.object({
  email: z.string().email(),
  requestType: z.enum(['access', 'erasure', 'portability', 'rectification']),
  description: z.string().max(2000).optional(),
});

export const ConsentSchema = z.object({
  purpose: z.string().min(1).max(255),
  dataTypes: z.array(z.string()),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  thirdPartySharing: z.boolean().default(false),
});

// ============================================
// Watermark Schemas
// ============================================

export const WatermarkDetectionSchema = z.object({
  audioData: z.string().min(1), // Base64 encoded
  algorithm: z.enum(['spread-spectrum-fft', 'phase-coding']).default('spread-spectrum-fft'),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Validate request body against schema
 * Returns parsed data or throws validation error
 */
export function validateBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate query parameters against schema
 */
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const params = Object.fromEntries(searchParams.entries());
  return validateBody(params, schema);
}
