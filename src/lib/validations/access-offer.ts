import { z } from 'zod'

// INVARIANT: sampleMetadata must NEVER contain raw audio URLs or storage paths
// Allowed: metrics, hashes, synthetic clips metadata
// Blocked: gs://, s3://, http(s):// URLs, storage paths
const BLOCKED_SAMPLE_KEYS = ['sampleUrl', 'storagePath', 'signedUrl', 'blobUrl', 'audioUrl', 'fileUrl', 'downloadUrl']
const URL_PATTERN = /^(gs|s3|https?):\/\//i

export const SampleMetadataSchema = z.record(z.any()).refine(
  (data) => {
    // Block known dangerous keys
    for (const key of BLOCKED_SAMPLE_KEYS) {
      if (key in data) {
        return false
      }
    }
    // Block any string values that look like URLs
    for (const value of Object.values(data)) {
      if (typeof value === 'string' && URL_PATTERN.test(value)) {
        return false
      }
    }
    return true
  },
  {
    message: 'sampleMetadata must not contain URLs or storage paths. Only metadata (durations, SNR, hashes, synthetic flags) is allowed.',
  }
)

export const AccessConstraintsSchema = z.object({
  canStream: z.boolean(),
  canBatchDownload: z.boolean(),
  canCache: z.boolean(),
  canExport: z.boolean(),
  canFineTuneReuse: z.boolean(),
  maxConcurrentStreams: z.number().positive().optional(),
  rateLimit: z.string().optional(),
  retentionPolicy: z.string(),
  allowedRegions: z.array(z.string()).optional(),
  requiresEncryption: z.boolean(),
  requiresAuditLog: z.boolean(),
})

export const CreateAccessOfferSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  allowedPurposes: z.array(z.string()).min(1),
  constraints: AccessConstraintsSchema,
  jurisdiction: z.string().min(2),
  evidenceFormat: z.string().default('CRYPTOGRAPHIC_AUDIT_BUNDLE'),
  complianceLevel: z.string().default('SELF_DECLARED'),
  scopeHours: z.number().positive(),
  scopeRecordings: z.number().int().positive().optional(),
  priceModel: z.enum(['PAY_PER_HOUR', 'PAY_PER_REQUEST', 'FIXED_LEASE', 'TIERED']),
  pricePerHour: z.number().positive(),
  currency: z.string().default('USD'),
  language: z.string(),
  useCases: z.array(z.string()).default([]),
  riskClass: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  sampleMetadata: SampleMetadataSchema.optional(),
  expiresAt: z.string().datetime().optional(),
})

export const ExecuteAccessOfferSchema = z.object({
  usagePurpose: z.string().min(10).max(500),
  requestedHours: z.number().positive().optional(),
  environment: z.string().optional(),
})

export const CreateAccessReviewSchema = z.object({
  policyClarityRating: z.number().int().min(1).max(5),
  accessReliabilityRating: z.number().int().min(1).max(5),
  evidenceQualityRating: z.number().int().min(1).max(5),
  regulatorAccepted: z.boolean().optional(),
  regulatorName: z.string().optional(),
  auditSuccessful: z.boolean().optional(),
  auditFeedback: z.string().optional(),
  overallRating: z.number().int().min(1).max(5),
  review: z.string().optional(),
  usedFor: z.string().optional(),
})

export type CreateAccessOfferInput = z.infer<typeof CreateAccessOfferSchema>
export type ExecuteAccessOfferInput = z.infer<typeof ExecuteAccessOfferSchema>
export type CreateAccessReviewInput = z.infer<typeof CreateAccessReviewSchema>
export type AccessConstraints = z.infer<typeof AccessConstraintsSchema>
