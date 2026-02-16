/**
 * XASE SDK - TypeScript Types
 */
interface XaseClientConfig {
    /** Your Xase API key (required) */
    apiKey: string;
    /** API base URL (default: http://localhost:3000/api/xase/v1) */
    baseUrl?: string;
    /** Request timeout in milliseconds (default: 3000) */
    timeout?: number;
    /** Enable fire-and-forget mode for zero latency (default: true) */
    fireAndForget?: boolean;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Maximum queue size for fire-and-forget (default: 10000) */
    queueMaxSize?: number;
    /** Callback on error */
    onError?: (error: XaseError) => void;
    /** Callback on success */
    onSuccess?: (result: RecordResult) => void;
}
interface RecordPayload {
    /** Policy or model ID (e.g., "credit_policy_v4") */
    policy: string;
    /** Input data for the AI decision */
    input: Record<string, any>;
    /** Output/result of the AI decision */
    output: Record<string, any>;
    /** AI confidence score (0-1) */
    confidence?: number;
    /** Additional context metadata */
    context?: Record<string, any>;
    /** Transaction ID for idempotency */
    transactionId?: string;
    /** Policy version */
    policyVersion?: string;
    /** Type of decision */
    decisionType?: string;
    /** Processing time in milliseconds */
    processingTime?: number;
    /** Store full payload (default: false) */
    storePayload?: boolean;
}
interface RecordOptions {
    /** Custom idempotency key (UUID or alphanumeric 16-64 chars) */
    idempotencyKey?: string;
    /** Override timeout for this request */
    timeout?: number;
    /** Force synchronous mode even with fireAndForget enabled */
    skipQueue?: boolean;
}
interface RecordResult {
    success: true;
    transaction_id: string;
    receipt_url: string;
    timestamp: string;
    record_hash: string;
    chain_position: 'chained' | 'genesis';
}
declare class XaseError extends Error {
    code: string;
    statusCode?: number | undefined;
    details?: any | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined, details?: any | undefined);
}

/**
 * XASE SDK - Main Client
 *
 * Official SDK for recording AI decisions as immutable evidence
 */

declare class XaseClient {
    private httpClient;
    private queue?;
    private config;
    private exitHandlersRegistered;
    constructor(config: XaseClientConfig);
    /**
     * Record an AI decision as immutable evidence
     *
     * @param payload - Decision data (policy, input, output, etc.)
     * @param options - Optional settings (idempotency, timeout, etc.)
     * @returns Promise<RecordResult | void> - Result if sync, void if fire-and-forget
     */
    record(payload: RecordPayload, options?: RecordOptions): Promise<RecordResult | void>;
    /**
     * Send record synchronously
     */
    private sendRecord;
    /**
     * Validate record payload
     */
    private validatePayload;
    /**
     * Flush pending queue items
     *
     * @param timeoutMs - Maximum time to wait (default: 5000ms)
     */
    flush(timeoutMs?: number): Promise<void>;
    /**
     * Close client and flush queue
     */
    close(): Promise<void>;
    /**
     * Get queue statistics (if fire-and-forget enabled)
     */
    getStats(): {
        size: number;
        processing: boolean;
        closed: boolean;
    } | null;
    /**
     * Register process exit handlers
     */
    private registerExitHandlers;
}

export { type RecordOptions, type RecordPayload, type RecordResult, XaseClient, type XaseClientConfig, XaseError };
