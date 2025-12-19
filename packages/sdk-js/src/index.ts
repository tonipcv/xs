/**
 * XASE SDK for Node.js
 * 
 * Official SDK for recording AI decisions as immutable evidence.
 * 
 * @example
 * ```typescript
 * import { XaseClient } from '@xase/sdk-js'
 * 
 * const xase = new XaseClient({
 *   apiKey: process.env.XASE_API_KEY!,
 *   fireAndForget: true,
 * })
 * 
 * await xase.record({
 *   policy: 'credit_policy_v4',
 *   input: { user_id: 'u_4829', amount: 50000 },
 *   output: { decision: 'APPROVED' },
 *   confidence: 0.94,
 * })
 * ```
 */

export { XaseClient } from './client'
export type {
  XaseClientConfig,
  RecordPayload,
  RecordOptions,
  RecordResult,
} from './types'
export { XaseError } from './types'
