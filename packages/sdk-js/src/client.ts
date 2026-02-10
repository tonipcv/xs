/**
 * XASE SDK - Main Client
 * 
 * Official SDK for recording AI decisions as immutable evidence
 */

import { XaseClientConfig, RecordPayload, RecordOptions, RecordResult, XaseError } from './types'
import { HttpClient } from './http'
import { Queue } from './queue'
import { captureContext, generateIdempotencyKey, isValidIdempotencyKey } from './context'

export class XaseClient {
  private httpClient: HttpClient
  private queue?: Queue
  private config: Required<XaseClientConfig>
  private exitHandlersRegistered = false
  
  constructor(config: XaseClientConfig) {
    // Validate API key
    if (!config.apiKey) {
      throw new XaseError('API key is required', 'MISSING_API_KEY')
    }
    
    // Merge with defaults
    this.config = {
      baseUrl: config.baseUrl || process.env.XASE_BASE_URL || 'http://localhost:3000/api/xase/v1',
      timeout: config.timeout || 3000,
      fireAndForget: config.fireAndForget ?? true,
      maxRetries: config.maxRetries || 3,
      queueMaxSize: config.queueMaxSize || 10000,
      onError: config.onError || (() => {}),
      onSuccess: config.onSuccess || (() => {}),
      apiKey: config.apiKey,
    }
    
    // Initialize HTTP client
    this.httpClient = new HttpClient(
      this.config.apiKey,
      this.config.baseUrl,
      this.config.timeout,
      {
        maxRetries: this.config.maxRetries,
        baseDelay: 100,
        maxDelay: 5000,
      }
    )
    
    // Initialize queue if fire-and-forget enabled
    if (this.config.fireAndForget) {
      this.queue = new Queue(
        this.httpClient,
        this.config.queueMaxSize,
        this.config.onError,
        this.config.onSuccess
      )
      
      this.registerExitHandlers()
    }
  }
  
  /**
   * Record an AI decision as immutable evidence
   * 
   * @param payload - Decision data (policy, input, output, etc.)
   * @param options - Optional settings (idempotency, timeout, etc.)
   * @returns Promise<RecordResult | void> - Result if sync, void if fire-and-forget
   */
  async record(
    payload: RecordPayload,
    options?: RecordOptions
  ): Promise<RecordResult | void> {
    // Validate payload
    this.validatePayload(payload)
    
    // Enrich with runtime context
    const enrichedPayload: RecordPayload = {
      ...payload,
      context: {
        ...captureContext(),
        ...payload.context,
      },
    }
    
    // Generate idempotency key if needed
    let finalOptions = options
    if (!options?.idempotencyKey && payload.transactionId) {
      const key = generateIdempotencyKey(payload.transactionId)
      finalOptions = {
        ...options,
        idempotencyKey: key,
      }
    }
    
    // Validate idempotency key format if provided
    if (finalOptions?.idempotencyKey && !isValidIdempotencyKey(finalOptions.idempotencyKey)) {
      throw new XaseError(
        'Invalid idempotency key format. Use UUID v4 or alphanumeric 16-64 chars',
        'INVALID_IDEMPOTENCY_KEY'
      )
    }
    
    // Fire-and-forget mode
    if (this.config.fireAndForget && !options?.skipQueue && this.queue) {
      await this.queue.enqueue(enrichedPayload, finalOptions)
      return
    }
    
    // Synchronous mode
    return await this.sendRecord(enrichedPayload, finalOptions)
  }
  
  /**
   * Send record synchronously
   */
  private async sendRecord(
    payload: RecordPayload,
    options?: RecordOptions
  ): Promise<RecordResult> {
    const headers: Record<string, string> = {}
    
    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey
    }
    
    // Map SDK payload to API schema
    const body = {
      input: payload.input,
      output: payload.output,
      context: payload.context,
      policyId: payload.policy,
      policyVersion: payload.policyVersion,
      decisionType: payload.decisionType,
      confidence: payload.confidence,
      processingTime: payload.processingTime,
      storePayload: payload.storePayload,
    }
    
    return await this.httpClient.post('/records', body, headers)
  }
  
  /**
   * Validate record payload
   */
  private validatePayload(payload: RecordPayload): void {
    if (!payload.policy) {
      throw new XaseError('Policy is required', 'MISSING_POLICY')
    }
    
    if (!payload.input || typeof payload.input !== 'object') {
      throw new XaseError('Input must be an object', 'INVALID_INPUT')
    }
    
    if (!payload.output || typeof payload.output !== 'object') {
      throw new XaseError('Output must be an object', 'INVALID_OUTPUT')
    }
    
    if (payload.confidence !== undefined) {
      if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
        throw new XaseError('Confidence must be a number between 0 and 1', 'INVALID_CONFIDENCE')
      }
    }
  }
  
  /**
   * Flush pending queue items
   * 
   * @param timeoutMs - Maximum time to wait (default: 5000ms)
   */
  async flush(timeoutMs = 5000): Promise<void> {
    if (this.queue) {
      await this.queue.flush(timeoutMs)
    }
  }
  
  /**
   * Close client and flush queue
   */
  async close(): Promise<void> {
    try {
      await this.flush(2000)
    } finally {
      this.queue?.close()
    }
  }
  
  /**
   * Get queue statistics (if fire-and-forget enabled)
   */
  getStats() {
    if (!this.queue) {
      return null
    }
    
    return this.queue.getStats()
  }
  
  /**
   * Register process exit handlers
   */
  private registerExitHandlers() {
    if (this.exitHandlersRegistered) return
    
    const handleExit = async () => {
      try {
        await this.flush(2000)
      } catch (error) {
        console.error('Error flushing queue on exit:', error)
      }
    }
    
    process.on('beforeExit', handleExit)
    process.on('SIGINT', () => {
      handleExit().finally(() => process.exit(0))
    })
    process.on('SIGTERM', () => {
      handleExit().finally(() => process.exit(0))
    })
    
    this.exitHandlersRegistered = true
  }
}
