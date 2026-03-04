/**
 * INPUT VALIDATION HARDENING
 * Comprehensive validation for all API inputs
 */

import { z } from 'zod'

// ============================================
// ID Validation Schemas
// ============================================

export const TenantIdSchema = z.string()
  .min(1, 'Tenant ID is required')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid tenant ID format')
  .refine(
    (id) => !id.includes('@') && !id.includes(' '),
    'Tenant ID cannot contain @ or spaces'
  )

export const DatasetIdSchema = z.string()
  .min(1, 'Dataset ID is required')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid dataset ID format')

export const LeaseIdSchema = z.string()
  .min(1, 'Lease ID is required')
  .regex(/^lease_[a-zA-Z0-9]+$/, 'Lease ID must start with lease_')

export const PolicyIdSchema = z.string()
  .min(1, 'Policy ID is required')
  .regex(/^policy_[a-zA-Z0-9]+$/, 'Policy ID must start with policy_')

export const ApiKeySchema = z.string()
  .min(1, 'API key is required')
  .regex(/^xase_[a-zA-Z0-9]{32,}$/, 'Invalid API key format')

// ============================================
// Numeric Validation Schemas
// ============================================

export const PositiveIntegerSchema = z.number()
  .int('Must be an integer')
  .positive('Must be positive')

export const NonNegativeIntegerSchema = z.number()
  .int('Must be an integer')
  .nonnegative('Must be non-negative')

export const PositiveBigIntSchema = z.bigint()
  .refine((val) => val > BigInt(0), 'Must be positive')

export const NonNegativeBigIntSchema = z.bigint()
  .refine((val) => val >= BigInt(0), 'Must be non-negative')

// ============================================
// Pricing Validation Schemas
// ============================================

export const PriceSchema = z.number()
  .nonnegative('Price must be non-negative')
  .max(1000000, 'Price exceeds maximum allowed')
  .refine(
    (price) => Number.isFinite(price),
    'Price must be a finite number'
  )

export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP', 'BRL'])

export const PricingContextSchema = z.object({
  offerId: z.string().optional(),
  policyId: PolicyIdSchema.optional(),
  leaseId: LeaseIdSchema.optional(),
  tenantId: TenantIdSchema,
})

// ============================================
// Storage Validation Schemas
// ============================================

export const StorageBytesSchema = z.bigint()
  .refine((val) => val >= BigInt(0), 'Storage bytes must be non-negative')
  .refine((val) => val <= BigInt('9007199254740991'), 'Storage bytes exceeds safe integer')

export const StorageSnapshotSchema = z.object({
  tenantId: TenantIdSchema,
  datasetId: DatasetIdSchema.optional(),
  leaseId: LeaseIdSchema.optional(),
  storageBytes: StorageBytesSchema,
  snapshotType: z.enum(['PERIODIC', 'ON_DEMAND', 'LEASE_START', 'LEASE_END']).optional(),
  billingPeriod: z.string().optional(),
  hoursInPeriod: z.number().positive().optional(),
})

// ============================================
// Billing Validation Schemas
// ============================================

export const UsageRecordSchema = z.object({
  executionId: z.string().min(1),
  bytesProcessed: NonNegativeBigIntSchema,
  computeHours: z.number().nonnegative(),
  storageGbHours: z.number().nonnegative().optional(),
  cost: PriceSchema,
})

export const BillingPeriodSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Billing period must be in YYYY-MM format')

// ============================================
// Policy Validation Schemas
// ============================================

export const PolicyValidationContextSchema = z.object({
  leaseId: LeaseIdSchema.optional(),
  policyId: PolicyIdSchema.optional(),
  datasetId: DatasetIdSchema.optional(),
  clientTenantId: TenantIdSchema.optional(),
  action: z.enum(['BATCH_DOWNLOAD', 'STREAM_ACCESS', 'METADATA_VIEW']).optional(),
  requestedHours: z.number().positive().optional(),
  requestedDownloads: PositiveIntegerSchema.optional(),
})

// ============================================
// Rate Limiting Validation Schemas
// ============================================

export const RateLimitKeySchema = z.string()
  .min(1, 'Rate limit key is required')
  .max(256, 'Rate limit key too long')

export const IpAddressSchema = z.string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    'Invalid IP address format'
  )
  .or(z.literal('unknown'))

// ============================================
// Webhook Validation Schemas
// ============================================

export const WebhookUrlSchema = z.string()
  .url('Invalid webhook URL')
  .refine(
    (url) => url.startsWith('https://'),
    'Webhook URL must use HTTPS'
  )
  .refine(
    (url) => !url.includes('localhost') && !url.includes('127.0.0.1'),
    'Webhook URL cannot be localhost'
  )

export const WebhookPayloadSchema = z.object({
  event: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.record(z.any()),
  signature: z.string().optional(),
})

// ============================================
// Dataset Validation Schemas
// ============================================

export const DatasetStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'DELETED'])

export const ConsentStatusSchema = z.enum([
  'PENDING',
  'VERIFIED_BY_XASE',
  'SELF_DECLARED',
  'MISSING',
  'REVOKED',
])

export const CreateDatasetSchema = z.object({
  tenantId: TenantIdSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  language: z.string().min(2).max(10),
  storageLocation: z.string().min(1),
  consentStatus: ConsentStatusSchema.optional(),
  allowedPurposes: z.array(z.string()).optional(),
})

// ============================================
// Access Control Validation Schemas
// ============================================

export const CreatePolicySchema = z.object({
  datasetId: DatasetIdSchema,
  clientTenantId: TenantIdSchema,
  usagePurpose: z.string().min(1).max(255),
  maxHours: z.number().positive().optional(),
  maxDownloads: PositiveIntegerSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  canStream: z.boolean().optional(),
  canBatchDownload: z.boolean().optional(),
})

export const CreateLeaseSchema = z.object({
  datasetId: DatasetIdSchema,
  clientTenantId: TenantIdSchema,
  policyId: PolicyIdSchema,
  ttlSeconds: PositiveIntegerSchema,
  autoRenew: z.boolean().optional(),
  maxRenewals: NonNegativeIntegerSchema.optional(),
  budgetLimit: PriceSchema.optional(),
})

// ============================================
// Validation Helper Functions
// ============================================

export function validateTenantId(tenantId: unknown): string {
  return TenantIdSchema.parse(tenantId)
}

export function validateDatasetId(datasetId: unknown): string {
  return DatasetIdSchema.parse(datasetId)
}

export function validateLeaseId(leaseId: unknown): string {
  return LeaseIdSchema.parse(leaseId)
}

export function validatePolicyId(policyId: unknown): string {
  return PolicyIdSchema.parse(policyId)
}

export function validateApiKey(apiKey: unknown): string {
  return ApiKeySchema.parse(apiKey)
}

export function validatePrice(price: unknown): number {
  return PriceSchema.parse(price)
}

export function validateStorageBytes(bytes: unknown): bigint {
  return StorageBytesSchema.parse(bytes)
}

export function validateIpAddress(ip: unknown): string {
  return IpAddressSchema.parse(ip)
}

export function validateWebhookUrl(url: unknown): string {
  return WebhookUrlSchema.parse(url)
}

/**
 * Safe parse with detailed error messages
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  const errors = result.error.errors.map(
    (err) => `${err.path.join('.')}: ${err.message}`
  )
  
  return { success: false, errors }
}

/**
 * Validate and sanitize tenant ID
 */
export function sanitizeTenantId(tenantId: string): string {
  const cleaned = tenantId.trim().toLowerCase()
  return validateTenantId(cleaned)
}

/**
 * Validate pagination parameters
 */
export const PaginationSchema = z.object({
  page: PositiveIntegerSchema.default(1),
  limit: PositiveIntegerSchema.max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

/**
 * Validate date range
 */
export const DateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  'Start date must be before or equal to end date'
)

/**
 * Validate email
 */
export const EmailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')

/**
 * Validate phone number (international format)
 */
export const PhoneSchema = z.string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (use E.164 format)')

/**
 * Sanitize string input (prevent XSS)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=\s*[^>\s]*/gi, '') // Remove event handlers
    .trim()
}

/**
 * Validate JSON string
 */
export function validateJsonString(input: string): object {
  try {
    const parsed = JSON.parse(input)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid JSON object')
    }
    return parsed
  } catch (error) {
    throw new Error('Invalid JSON string')
  }
}
