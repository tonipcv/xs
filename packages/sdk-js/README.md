# @xase/sdk-js

> Official Xase SDK for Node.js - Evidence Layer for AI Agents

[![npm version](https://img.shields.io/npm/v/@xase/sdk-js.svg)](https://www.npmjs.com/package/@xase/sdk-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn automated decisions into immutable legal records. Don't just log what your AI did—**prove why it was right**.

## Features

- ⚡ **Zero Latency Impact** - Fire-and-forget mode with async queue
- 🔒 **Immutable Evidence** - Cryptographic hash chain + KMS signatures
- 🔄 **Automatic Retry** - Exponential backoff with jitter
- 🎯 **Idempotency** - Built-in deduplication
- 📊 **Type-Safe** - Full TypeScript support
- 🚀 **Production Ready** - Battle-tested reliability

---

## Installation

```bash
npm install @xase/sdk-js
```

**Requirements:** Node.js >= 18.0.0

---

## Quick Start

### 1. Get your API Key

Sign up at [xase.ai](https://xase.ai) and create an API key in your dashboard.

### 2. Initialize the client

```typescript
import { XaseClient } from '@xase/sdk-js'

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: true, // Zero latency impact
})
```

### 3. Record decisions

```typescript
await xase.record({
  policy: 'credit_policy_v4',
  input: { user_id: 'u_4829', amount: 50000, credit_score: 720 },
  output: { decision: 'APPROVED' },
  confidence: 0.94,
})
```

That's it! Your AI decision is now immutable evidence.

---

## Configuration

### XaseClientConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | **required** | Your Xase API key |
| `baseUrl` | `string` | `http://localhost:3000/api/xase/v1` | API base URL |
| `fireAndForget` | `boolean` | `true` | Enable async queue for zero latency |
| `timeout` | `number` | `3000` | Request timeout in milliseconds |
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `queueMaxSize` | `number` | `10000` | Maximum queue size (fire-and-forget mode) |
| `onSuccess` | `function` | `undefined` | Callback on successful record |
| `onError` | `function` | `undefined` | Callback on error |

### Example with all options

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'https://api.xase.ai/v1',
  fireAndForget: true,
  timeout: 5000,
  maxRetries: 5,
  queueMaxSize: 50000,
  onSuccess: (result) => {
    console.log('Evidence recorded:', result.transaction_id)
  },
  onError: (error) => {
    console.error('Failed to record:', error.code, error.message)
  },
})
```

---

## API Reference

### `record(payload, options?)`

Records an AI decision as immutable evidence.

#### Payload

```typescript
interface RecordPayload {
  policy: string                    // Policy/model ID (e.g., "credit_policy_v4")
  input: Record<string, any>        // Decision input data
  output: Record<string, any>       // Decision output/result
  confidence?: number               // AI confidence score (0-1)
  context?: Record<string, any>     // Additional context metadata
  transactionId?: string            // For idempotency
  policyVersion?: string            // Policy version
  decisionType?: string             // Type of decision
  processingTime?: number           // Processing time in ms
  storePayload?: boolean            // Store full payload (default: false)
}
```

#### Options

```typescript
interface RecordOptions {
  idempotencyKey?: string           // Custom idempotency key (UUID or 16-64 alphanumeric)
  timeout?: number                  // Override timeout for this request
  skipQueue?: boolean               // Force synchronous mode
}
```

#### Returns

- **Fire-and-forget mode** (`fireAndForget: true`): `Promise<void>`
- **Synchronous mode** (`fireAndForget: false` or `skipQueue: true`): `Promise<RecordResult>`

```typescript
interface RecordResult {
  success: true
  transaction_id: string
  receipt_url: string
  timestamp: string
  record_hash: string
  chain_position: 'chained' | 'genesis'
}
```

---

### `flush(timeoutMs?)`

Flushes all pending queue items (fire-and-forget mode only).

```typescript
await xase.flush(5000) // Wait up to 5 seconds
```

**Use cases:**
- Before process exit
- Before critical operations
- For testing

---

### `close()`

Closes the client and flushes the queue.

```typescript
await xase.close()
```

---

### `getStats()`

Returns queue statistics (fire-and-forget mode only).

```typescript
const stats = xase.getStats()
console.log(stats)
// { size: 42, processing: true, closed: false }
```

---

## Usage Examples

### Fire-and-Forget (Zero Latency)

```typescript
import { XaseClient } from '@xase/sdk-js'

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: true,
})

async function approveLoan(userData) {
  // Your AI decision logic
  const decision = userData.credit_score >= 700 ? 'APPROVED' : 'DENIED'
  
  // Record evidence (returns immediately, queued for async processing)
  await xase.record({
    policy: 'credit_policy_v4',
    input: userData,
    output: { decision },
    confidence: 0.94,
    transactionId: `loan_${userData.user_id}`,
  })
  
  return decision // Zero latency impact!
}

// Flush before exit
process.on('beforeExit', async () => {
  await xase.flush(2000)
})
```

---

### Synchronous Mode (Immediate Response)

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: false, // Synchronous mode
})

async function detectFraud(transaction) {
  const isFraud = /* your logic */
  
  // Wait for response
  const result = await xase.record({
    policy: 'fraud_detection_v2',
    input: transaction,
    output: { is_fraud: isFraud },
    confidence: 0.87,
  })
  
  console.log('Evidence recorded:', result.transaction_id)
  console.log('Receipt URL:', result.receipt_url)
  
  return { isFraud, evidence: result }
}
```

---

### TypeScript (Type-Safe)

```typescript
import { XaseClient, RecordPayload, XaseError } from '@xase/sdk-js'

interface LoanApplication {
  user_id: string
  amount: number
  credit_score: number
}

interface LoanDecision {
  decision: 'APPROVED' | 'DENIED'
  reason?: string
}

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
})

async function processLoan(app: LoanApplication): Promise<LoanDecision> {
  const decision: LoanDecision = /* your logic */
  
  const payload: RecordPayload = {
    policy: 'credit_policy_v4',
    input: app,
    output: decision,
    confidence: app.credit_score / 850,
  }
  
  try {
    await xase.record(payload)
  } catch (error) {
    if (error instanceof XaseError) {
      console.error('Failed:', error.code, error.message)
    }
    throw error
  }
  
  return decision
}
```

---

### Idempotency

Prevent duplicate records with idempotency keys:

```typescript
// Automatic (using transactionId)
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
  transactionId: 'loan_12345', // Auto-generates idempotency key
})

// Manual
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
}, {
  idempotencyKey: 'my-custom-key-12345',
})
```

**Idempotency key format:**
- UUID v4: `550e8400-e29b-41d4-a716-446655440000`
- Alphanumeric: `my_key_1234567890` (16-64 chars)

---

### Error Handling

```typescript
import { XaseError } from '@xase/sdk-js'

try {
  await xase.record({ ... }, { skipQueue: true })
} catch (error) {
  if (error instanceof XaseError) {
    console.error('Code:', error.code)
    console.error('Status:', error.statusCode)
    console.error('Details:', error.details)
    
    switch (error.code) {
      case 'UNAUTHORIZED':
        // Invalid API key
        break
      case 'RATE_LIMIT_EXCEEDED':
        // Too many requests
        break
      case 'VALIDATION_ERROR':
        // Invalid payload
        break
      default:
        // Other errors
    }
  }
}
```

**Common error codes:**
- `UNAUTHORIZED` - Invalid API key
- `FORBIDDEN` - Missing permissions
- `RATE_LIMIT_EXCEEDED` - Rate limit hit
- `VALIDATION_ERROR` - Invalid payload
- `QUEUE_FULL` - Queue size exceeded
- `FLUSH_TIMEOUT` - Flush timeout
- `MAX_RETRIES` - Max retries exceeded

---

## Advanced Usage

### Custom Context

Enrich records with custom metadata:

```typescript
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
  context: {
    user_agent: req.headers['user-agent'],
    ip_address: req.ip,
    session_id: req.session.id,
    feature_flags: { new_model: true },
  },
})
```

**Note:** Runtime context (Node version, hostname, etc.) is automatically captured.

---

### Store Full Payload

By default, only hashes are stored. To store full payloads:

```typescript
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
  storePayload: true, // Store full input/output
})
```

**Warning:** Storing payloads may expose PII. Use with caution.

---

### Callbacks

Monitor success and errors:

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  onSuccess: (result) => {
    metrics.increment('xase.records.success')
    logger.info('Evidence recorded', { txn: result.transaction_id })
  },
  onError: (error) => {
    metrics.increment('xase.records.error')
    logger.error('Failed to record', { code: error.code })
  },
})
```

---

### Queue Management

Monitor and control the queue:

```typescript
// Get stats
const stats = xase.getStats()
console.log(`Queue size: ${stats.size}`)

// Flush manually
await xase.flush(5000)

// Close gracefully
await xase.close()
```

---

## Best Practices

### 1. Use Fire-and-Forget for Production

```typescript
// ✅ Recommended
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: true, // Zero latency
})

// ❌ Avoid in hot path
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: false, // Blocks your code
})
```

---

### 2. Flush Before Exit

```typescript
process.on('beforeExit', async () => {
  await xase.flush(2000)
})

process.on('SIGINT', async () => {
  await xase.close()
  process.exit(0)
})
```

---

### 3. Use Idempotency

```typescript
// ✅ Idempotent
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
  transactionId: `loan_${userId}_${timestamp}`,
})

// ❌ Not idempotent (may create duplicates on retry)
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
})
```

---

### 4. Handle Errors Gracefully

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  onError: (error) => {
    // Log but don't crash
    logger.error('Xase error', { code: error.code })
    
    // Alert on critical errors
    if (error.code === 'UNAUTHORIZED') {
      alerting.critical('Invalid Xase API key')
    }
  },
})
```

---

### 5. Use Environment Variables

```typescript
// ✅ Secure
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: process.env.XASE_BASE_URL,
})

// ❌ Never hardcode
const xase = new XaseClient({
  apiKey: 'xase_pk_1234567890abcdef', // DON'T DO THIS
})
```

---

## Troubleshooting

### "Missing X-API-Key header"

**Cause:** API key not provided or invalid.

**Fix:**
```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!, // Make sure this is set
})
```

---

### "Rate limit exceeded"

**Cause:** Too many requests.

**Fix:**
- Use fire-and-forget mode (queues requests)
- Increase rate limit in dashboard
- Implement backpressure in your app

---

### "Queue full, item dropped"

**Cause:** Queue size exceeded.

**Fix:**
```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  queueMaxSize: 50000, // Increase queue size
})
```

---

### "Flush timeout"

**Cause:** Queue didn't flush in time.

**Fix:**
```typescript
await xase.flush(10000) // Increase timeout
```

---

### Network Errors

**Cause:** Cannot reach API.

**Fix:**
- Check `baseUrl` configuration
- Verify network connectivity
- Check firewall rules

---

## Performance

### Benchmarks

- **Fire-and-forget mode:** ~0.1ms overhead
- **Synchronous mode:** ~50-200ms (network dependent)
- **Queue throughput:** ~10,000 records/sec

### Memory Usage

- **Base:** ~5MB
- **Per queued item:** ~1KB
- **Max (10k queue):** ~15MB

---

## Compliance

Xase SDK helps you comply with:

- **EU AI Act** - Immutable audit trail
- **GDPR** - Right to explanation
- **SOC 2** - Access controls & logging
- **ISO 42001** - AI management system

---

## Support

- **Documentation:** [docs.xase.ai](https://docs.xase.ai)
- **API Reference:** [api.xase.ai/docs](https://api.xase.ai/docs)
- **GitHub Issues:** [github.com/xase/sdk-js/issues](https://github.com/xase/sdk-js/issues)
- **Email:** support@xase.ai

---

## License

MIT © Xase

---

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

---

**Built with ❤️ by the Xase team**
