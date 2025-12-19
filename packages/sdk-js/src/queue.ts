/**
 * XASE SDK - Fire-and-Forget Queue
 * 
 * In-memory queue with background worker for zero-latency evidence recording
 */

import { RecordPayload, RecordOptions, RecordResult, XaseError } from './types'
import { HttpClient } from './http'

interface QueueItem {
  payload: RecordPayload
  options?: RecordOptions
  resolve: (value: void) => void
  reject: (error: Error) => void
}

export class Queue {
  private queue: QueueItem[] = []
  private processing = false
  private closed = false
  private workerInterval: NodeJS.Timeout | null = null
  
  constructor(
    private httpClient: HttpClient,
    private maxSize: number,
    private onError?: (error: XaseError) => void,
    private onSuccess?: (result: RecordResult) => void
  ) {
    this.startWorker()
  }
  
  /**
   * Enqueue a record for async processing
   */
  enqueue(
    payload: RecordPayload,
    options?: RecordOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new XaseError('Queue is closed', 'QUEUE_CLOSED'))
        return
      }
      
      // If queue is full, drop oldest item
      if (this.queue.length >= this.maxSize) {
        const dropped = this.queue.shift()
        if (dropped) {
          const error = new XaseError('Queue full, item dropped', 'QUEUE_FULL')
          this.onError?.(error)
          dropped.reject(error)
        }
      }
      
      this.queue.push({ payload, options, resolve, reject })
    })
  }
  
  /**
   * Start background worker
   */
  private startWorker() {
    this.workerInterval = setInterval(() => {
      this.processQueue().catch(console.error)
    }, 100)
  }
  
  /**
   * Process queue items
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()
        if (!item) break
        
        try {
          const result = await this.sendRecord(item.payload, item.options)
          this.onSuccess?.(result)
          item.resolve()
        } catch (error: any) {
          const xaseError = error instanceof XaseError 
            ? error 
            : new XaseError(error.message, 'QUEUE_ERROR', undefined, error)
          
          this.onError?.(xaseError)
          item.reject(xaseError)
        }
      }
    } finally {
      this.processing = false
    }
  }
  
  /**
   * Send record to API
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
   * Flush all pending items
   */
  async flush(timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    
    while (this.queue.length > 0 || this.processing) {
      if (Date.now() - start > timeoutMs) {
        throw new XaseError(
          `Flush timeout: ${this.queue.length} items remaining`,
          'FLUSH_TIMEOUT'
        )
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  
  /**
   * Close queue and stop worker
   */
  close() {
    this.closed = true
    if (this.workerInterval) {
      clearInterval(this.workerInterval)
      this.workerInterval = null
    }
  }
  
  /**
   * Get queue stats
   */
  getStats() {
    return {
      size: this.queue.length,
      processing: this.processing,
      closed: this.closed,
    }
  }
}
