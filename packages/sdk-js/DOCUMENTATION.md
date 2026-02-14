# XASE SDK - Documentação Técnica Completa

## Índice

1. [Arquitetura](#arquitetura)
2. [Fluxo de Dados](#fluxo-de-dados)
3. [Componentes Internos](#componentes-internos)
4. [Retry e Idempotência](#retry-e-idempotência)
5. [Fire-and-Forget](#fire-and-forget)
6. [Segurança](#segurança)
7. [Performance](#performance)
8. [Troubleshooting Avançado](#troubleshooting-avançado)

---

## Arquitetura

### Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                      User Application                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           xase.record({ policy, input, output })       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      XaseClient                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Validate   │  │   Enrich     │  │   Route      │      │
│  │   Payload    │→ │   Context    │→ │   (Sync/Async)│     │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                              │              │
│                      ┌───────────────────────┴──────┐       │
│                      │                              │       │
│                      ▼                              ▼       │
│           ┌──────────────────┐          ┌──────────────────┐│
│           │   HttpClient     │          │      Queue       ││
│           │   (Sync Mode)    │          │  (Async Mode)    ││
│           └────────┬─────────┘          └────────┬─────────┘│
│                    │                              │         │
│                    │  ┌───────────────────────────┘         │
│                    │  │                                     │
│                    ▼  ▼                                     │
│           ┌──────────────────┐                             │
│           │   Retry Logic    │                             │
│           │   + Backoff      │                             │
│           └────────┬─────────┘                             │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   POST /api/xase/v1    │
        │      /records          │
        │                        │
        │  Headers:              │
        │  - X-API-Key           │
        │  - Idempotency-Key     │
        │  - Content-Type        │
        └────────────────────────┘
```

---

## Fluxo de Dados

### 1. Fire-and-Forget Mode (Default)

```typescript
User Code
   │
   │ xase.record({ policy, input, output })
   │
   ▼
XaseClient.record()
   │
   ├─ Validate payload
   ├─ Enrich context (runtime, hostname, etc.)
   ├─ Generate idempotency key (if transactionId provided)
   │
   ▼
Queue.enqueue()
   │
   ├─ Check queue size
   ├─ Drop oldest if full
   ├─ Add to queue
   │
   └─ Return immediately ⚡ (zero latency)
   
Background Worker (every 100ms)
   │
   ▼
Queue.processQueue()
   │
   ├─ Dequeue item
   │
   ▼
HttpClient.post()
   │
   ├─ Build request
   ├─ Set headers (X-API-Key, Idempotency-Key)
   ├─ Retry loop (max 3 attempts)
   │  │
   │  ├─ Attempt 1: immediate
   │  ├─ Attempt 2: backoff 100-300ms
   │  ├─ Attempt 3: backoff 300-900ms
   │  └─ Attempt 4: backoff 900-2700ms
   │
   ├─ Handle response
   │  ├─ 2xx: Success → onSuccess callback
   │  ├─ 429: Retry with Retry-After
   │  ├─ 5xx: Retry with backoff
   │  └─ 4xx: Fail immediately → onError callback
   │
   └─ Return result
```

---

### 2. Synchronous Mode

```typescript
User Code
   │
   │ const result = await xase.record({ ... }, { skipQueue: true })
   │
   ▼
XaseClient.record()
   │
   ├─ Validate payload
   ├─ Enrich context
   ├─ Generate idempotency key
   │
   ▼
HttpClient.post() (direct, no queue)
   │
   ├─ Retry loop (max 3 attempts)
   │
   ▼
   │ Wait for response... ⏳
   │
   ▼
Return RecordResult
   │
   └─ { transaction_id, receipt_url, record_hash, ... }
```

---

## Componentes Internos

### 1. XaseClient

**Responsabilidades:**
- Validar configuração e payload
- Enriquecer contexto
- Rotear para modo síncrono ou assíncrono
- Gerenciar lifecycle (flush, close)

**Código-chave:**
```typescript
class XaseClient {
  private httpClient: HttpClient
  private queue?: Queue
  
  async record(payload, options?) {
    // 1. Validate
    this.validatePayload(payload)
    
    // 2. Enrich
    const enriched = {
      ...payload,
      context: { ...captureContext(), ...payload.context }
    }
    
    // 3. Route
    if (fireAndForget && !options?.skipQueue) {
      await this.queue.enqueue(enriched, options)
      return // Zero latency
    }
    
    // 4. Sync
    return await this.sendRecord(enriched, options)
  }
}
```

---

### 2. HttpClient

**Responsabilidades:**
- Fazer requisições HTTP
- Implementar retry com backoff exponencial
- Respeitar Retry-After (429)
- Tratar erros

**Retry Logic:**
```typescript
Attempt 1: immediate
Attempt 2: 100ms + jitter (±25%)
Attempt 3: 300ms + jitter (±25%)
Attempt 4: 900ms + jitter (±25%)
Max delay: 5000ms
```

**Retry Conditions:**
- ✅ Network errors (ECONNREFUSED, ETIMEDOUT, AbortError)
- ✅ HTTP 429 (Rate Limit)
- ✅ HTTP 5xx (Server Errors)
- ❌ HTTP 4xx (Client Errors) - fail immediately

**Código-chave:**
```typescript
class HttpClient {
  async post(endpoint, body, headers) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, { ... })
        
        if (response.ok) return await response.json()
        
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          await sleep(retryAfter ? retryAfter * 1000 : backoff(attempt))
          continue
        }
        
        if (response.status >= 500) {
          await sleep(backoff(attempt))
          continue
        }
        
        throw new XaseError(...)
      } catch (error) {
        if (isNetworkError(error) && attempt < maxRetries) {
          await sleep(backoff(attempt))
          continue
        }
        throw error
      }
    }
  }
}
```

---

### 3. Queue

**Responsabilidades:**
- Enfileirar records para processamento assíncrono
- Worker background (100ms interval)
- Política de descarte (FIFO quando cheio)
- Flush e close

**Estrutura:**
```typescript
interface QueueItem {
  payload: RecordPayload
  options?: RecordOptions
  resolve: (value: void) => void
  reject: (error: Error) => void
}

class Queue {
  private queue: QueueItem[] = []
  private processing = false
  private workerInterval: NodeJS.Timeout
  
  async enqueue(payload, options) {
    if (queue.length >= maxSize) {
      const dropped = queue.shift() // Drop oldest
      dropped.reject(new XaseError('QUEUE_FULL'))
    }
    
    return new Promise((resolve, reject) => {
      queue.push({ payload, options, resolve, reject })
    })
  }
  
  private async processQueue() {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        const result = await httpClient.post(...)
        onSuccess(result)
        item.resolve()
      } catch (error) {
        onError(error)
        item.reject(error)
      }
    }
  }
}
```

**Worker Interval:** 100ms (configurable)

**Queue Policies:**
- **Max Size:** 10,000 items (default)
- **Drop Policy:** FIFO (oldest first)
- **Flush Timeout:** 5,000ms (default)

---

### 4. Context Capture

**Responsabilidades:**
- Capturar informações do runtime
- Gerar idempotency keys
- Validar formato de keys

**Contexto Capturado:**
```typescript
{
  runtime: 'node@20.11.0',
  platform: 'darwin',
  arch: 'arm64',
  hostname: 'macbook-pro.local',
  pid: 12345,
  libVersion: '0.1.0',
  env: 'production',
  timestamp: 1704067200000
}
```

**Idempotency Key Generation:**
```typescript
function generateIdempotencyKey(data: string): string {
  return createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 32)
}
```

---

## Retry e Idempotência

### Retry Strategy

**Exponential Backoff com Jitter:**
```
delay = min(baseDelay * 2^attempt, maxDelay)
jitter = delay * 0.25 * (random() * 2 - 1)
finalDelay = delay + jitter
```

**Exemplo:**
```
Attempt 0: 0ms
Attempt 1: 100ms ± 25ms = 75-125ms
Attempt 2: 300ms ± 75ms = 225-375ms
Attempt 3: 900ms ± 225ms = 675-1125ms
Attempt 4: 2700ms ± 675ms = 2025-3375ms (capped at 5000ms)
```

**Retry-After Handling:**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After')
  const delay = retryAfter 
    ? parseInt(retryAfter) * 1000 
    : getBackoffDelay(attempt)
  await sleep(delay)
}
```

---

### Idempotência

**Automatic (via transactionId):**
```typescript
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
  transactionId: 'loan_12345', // Auto-generates key
})

// Internally:
idempotencyKey = sha256('loan_12345').substring(0, 32)
```

**Manual:**
```typescript
await xase.record({
  policy: 'credit_policy_v4',
  input: { ... },
  output: { ... },
}, {
  idempotencyKey: 'my-custom-key-1234567890',
})
```

**Validation:**
- UUID v4: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- Alphanumeric: `/^[a-zA-Z0-9_-]{16,64}$/`

**Backend Behavior:**
- Idempotency cache: 24h TTL
- Replay response: HTTP 201 + header `X-Idempotency-Replay: true`

---

## Fire-and-Forget

### Como Funciona

1. **Enqueue:** Record é adicionado à fila em memória (~0.1ms)
2. **Return:** Promise resolve imediatamente
3. **Background Worker:** Processa fila a cada 100ms
4. **Retry:** Falhas são retentadas automaticamente
5. **Callbacks:** `onSuccess` e `onError` notificam resultado

### Garantias

- ✅ **At-least-once delivery** (com retries)
- ✅ **Ordem FIFO** dentro da fila
- ✅ **Flush antes de exit** (via process hooks)
- ❌ **Não garante entrega** se processo crashar antes de flush

### Flush Automático

```typescript
// Registrado automaticamente no construtor
process.on('beforeExit', async () => {
  await xase.flush(2000)
})

process.on('SIGINT', async () => {
  await xase.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await xase.close()
  process.exit(0)
})
```

### Backpressure

**Quando a fila enche:**
1. Item mais antigo é descartado (FIFO)
2. Promise do item descartado é rejeitada com `XaseError('QUEUE_FULL')`
3. `onError` callback é chamado
4. Novo item é enfileirado

**Mitigação:**
- Aumentar `queueMaxSize`
- Monitorar `xase.getStats().size`
- Implementar backpressure no app

---

## Segurança

### API Key

**Formato:** `xase_pk_<48 hex chars>`

**Armazenamento:**
- ✅ Variável de ambiente (`process.env.XASE_API_KEY`)
- ❌ Hardcoded no código
- ❌ Versionado no Git

**Transmissão:**
- Header: `X-API-Key: xase_pk_...`
- HTTPS obrigatório em produção

**Backend:**
- Armazenado como bcrypt hash
- Comparação com `bcrypt.compare()`

---

### Idempotency Key

**Propósito:** Prevenir duplicação em retries

**Segurança:**
- Não contém dados sensíveis
- Gerado via SHA-256 (one-way)
- Cache com TTL de 24h

---

### Payload

**PII (Personally Identifiable Information):**
- Por padrão, apenas **hashes** são armazenados
- `storePayload: true` armazena dados completos (use com cuidado)

**Recomendações:**
- Redatar PII antes de enviar
- Usar `storePayload: false` (default)
- Implementar data retention policies

---

## Performance

### Benchmarks

**Hardware:** MacBook Pro M1, 16GB RAM, Node 20.11.0

| Operação | Fire-and-Forget | Synchronous |
|----------|-----------------|-------------|
| `record()` | 0.1ms | 50-200ms |
| Queue throughput | 10,000/sec | N/A |
| Memory (base) | 5MB | 5MB |
| Memory (10k queue) | 15MB | 5MB |

---

### Otimizações

**1. Fire-and-Forget Mode**
```typescript
// ✅ Recommended
const xase = new XaseClient({ fireAndForget: true })
await xase.record({ ... }) // ~0.1ms
```

**2. Batch Processing**
```typescript
// Process 1000 records
for (const item of items) {
  await xase.record({ ... }) // All queued, ~100ms total
}
await xase.flush() // Wait for all
```

**3. Idempotency**
```typescript
// Avoid duplicate work on retry
await xase.record({
  ...
  transactionId: `unique_${id}_${timestamp}`,
})
```

---

### Limites

| Recurso | Limite | Configurável |
|---------|--------|--------------|
| Queue size | 10,000 | ✅ `queueMaxSize` |
| Retry attempts | 3 | ✅ `maxRetries` |
| Request timeout | 3,000ms | ✅ `timeout` |
| Max backoff | 5,000ms | ❌ |
| Flush timeout | 5,000ms | ✅ (parâmetro) |

---

## Troubleshooting Avançado

### Debug Logging

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  onSuccess: (result) => {
    console.log('[XASE] Success:', result.transaction_id)
  },
  onError: (error) => {
    console.error('[XASE] Error:', {
      code: error.code,
      status: error.statusCode,
      message: error.message,
      details: error.details,
    })
  },
})
```

---

### Queue Monitoring

```typescript
setInterval(() => {
  const stats = xase.getStats()
  console.log('[XASE] Queue:', stats)
  
  if (stats.size > 5000) {
    console.warn('[XASE] Queue size high:', stats.size)
  }
}, 10000)
```

---

### Network Debugging

```typescript
// Test connectivity
const xase = new XaseClient({
  apiKey: 'test_key',
  baseUrl: 'http://localhost:3000/api/xase/v1',
  timeout: 10000,
})

try {
  await xase.record({ ... }, { skipQueue: true })
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('Cannot connect to API. Is the server running?')
  } else if (error.name === 'AbortError') {
    console.error('Request timeout. Increase timeout or check network.')
  }
}
```

---

### Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Queue size keeps increasing
- Process crashes with OOM

**Diagnosis:**
```typescript
setInterval(() => {
  const stats = xase.getStats()
  const memUsage = process.memoryUsage()
  
  console.log({
    queueSize: stats.size,
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
  })
}, 5000)
```

**Solutions:**
- Call `flush()` periodically
- Reduce `queueMaxSize`
- Implement backpressure in app
- Check for unclosed clients

---

### Rate Limiting

**Backend Limits:**
- Default: 1000 requests/hour per API key
- Configurable per tenant

**SDK Behavior:**
- HTTP 429 → Retry with `Retry-After`
- Exponential backoff if no `Retry-After`

**Mitigation:**
```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: true, // Queue absorbs bursts
  queueMaxSize: 50000, // Large queue
  onError: (error) => {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      // Implement backpressure
      pauseProcessing()
    }
  },
})
```

---

## Integração com Frameworks

### Express.js

```typescript
import express from 'express'
import { XaseClient } from '@xase/sdk-js'

const app = express()
const xase = new XaseClient({ apiKey: process.env.XASE_API_KEY! })

app.post('/approve-loan', async (req, res) => {
  const decision = /* your logic */
  
  // Record evidence (fire-and-forget)
  await xase.record({
    policy: 'credit_policy_v4',
    input: req.body,
    output: decision,
    context: {
      ip: req.ip,
      user_agent: req.headers['user-agent'],
    },
  })
  
  res.json(decision)
})

// Flush on shutdown
process.on('SIGTERM', async () => {
  await xase.close()
  server.close()
})
```

---

### NestJS

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { XaseClient } from '@xase/sdk-js'

@Injectable()
export class XaseService implements OnModuleDestroy {
  private client: XaseClient
  
  constructor() {
    this.client = new XaseClient({
      apiKey: process.env.XASE_API_KEY!,
    })
  }
  
  async record(payload) {
    return this.client.record(payload)
  }
  
  async onModuleDestroy() {
    await this.client.close()
  }
}
```

---

### AWS Lambda

```typescript
import { XaseClient } from '@xase/sdk-js'

// Initialize outside handler (reuse across invocations)
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  fireAndForget: false, // Use sync mode in Lambda
})

export const handler = async (event) => {
  const decision = /* your logic */
  
  // Record evidence synchronously
  const result = await xase.record({
    policy: 'fraud_detection_v2',
    input: event,
    output: decision,
  })
  
  return {
    statusCode: 200,
    body: JSON.stringify({ decision, evidence: result }),
  }
}
```

---

## Roadmap

### v0.2.0
- [ ] Metrics (Prometheus/StatsD)
- [ ] Structured logging
- [ ] Webhook support
- [ ] Batch API

### v0.3.0
- [ ] Redis queue (distributed)
- [ ] Compression (gzip)
- [ ] Circuit breaker
- [ ] Health checks

### v1.0.0
- [ ] Python SDK
- [ ] LangChain integration
- [ ] OpenAI plugin
- [ ] Auto-discovery

---

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para guidelines.

---

## Licença

MIT © Xase
