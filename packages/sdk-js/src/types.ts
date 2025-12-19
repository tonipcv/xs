/**
 * XASE SDK - TypeScript Types
 */

export interface XaseClientConfig {
  /** Your Xase API key (required) */
  apiKey: string
  /** API base URL (default: http://localhost:3000/api/xase/v1) */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 3000) */
  timeout?: number
  /** Enable fire-and-forget mode for zero latency (default: true) */
  fireAndForget?: boolean
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** Maximum queue size for fire-and-forget (default: 10000) */
  queueMaxSize?: number
  /** Callback on error */
  onError?: (error: XaseError) => void
  /** Callback on success */
  onSuccess?: (result: RecordResult) => void
}

export interface RecordPayload {
  /** Policy or model ID (e.g., "credit_policy_v4") */
  policy: string
  /** Input data for the AI decision */
  input: Record<string, any>
  /** Output/result of the AI decision */
  output: Record<string, any>
  /** AI confidence score (0-1) */
  confidence?: number
  /** Additional context metadata */
  context?: Record<string, any>
  /** Transaction ID for idempotency */
  transactionId?: string
  /** Policy version */
  policyVersion?: string
  /** Type of decision */
  decisionType?: string
  /** Processing time in milliseconds */
  processingTime?: number
  /** Store full payload (default: false) */
  storePayload?: boolean
}

export interface RecordOptions {
  /** Custom idempotency key (UUID or alphanumeric 16-64 chars) */
  idempotencyKey?: string
  /** Override timeout for this request */
  timeout?: number
  /** Force synchronous mode even with fireAndForget enabled */
  skipQueue?: boolean
}

export interface RecordResult {
  success: true
  transaction_id: string
  receipt_url: string
  timestamp: string
  record_hash: string
  chain_position: 'chained' | 'genesis'
}

export class XaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'XaseError'
    Object.setPrototypeOf(this, XaseError.prototype)
  }
}
