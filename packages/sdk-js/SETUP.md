# XASE SDK - Guia de Setup e Instalação

## 📦 Instalação

### Via npm (quando publicado)

```bash
npm install @xase/sdk-js
```

### Via yarn

```bash
yarn add @xase/sdk-js
```

### Via pnpm

```bash
pnpm add @xase/sdk-js
```

---

## 🔧 Setup Local (Desenvolvimento)

### 1. Build do SDK

```bash
cd packages/sdk-js
npm install
npm run build
```

**Output esperado:**
```
✓ Built dist/index.js (CJS)
✓ Built dist/index.mjs (ESM)
✓ Built dist/index.d.ts (Types)
```

---

### 2. Link Local (para testar antes de publicar)

```bash
# No diretório do SDK
cd packages/sdk-js
npm link

# No seu projeto
cd /path/to/your/project
npm link @xase/sdk-js
```

---

### 3. Testar Exemplos

```bash
# Build primeiro
npm run build

# Rodar exemplo básico
XASE_API_KEY=xase_pk_demo node examples/basic.js

# Rodar exemplo síncrono
XASE_API_KEY=xase_pk_demo node examples/sync.js
```

---

## 🔑 Obter API Key

### 1. Via Dashboard (Produção)

1. Acesse `http://localhost:3000/xase/api-keys`
2. Clique em "Nova API Key"
3. Escolha permissões: `ingest`, `verify`, `export`
4. Copie a key (será exibida apenas uma vez)

### 2. Via Seed Script (Desenvolvimento)

```bash
# No diretório raiz do projeto
node database/seed-demo-data.js
```

**Output:**
```
✅ Demo API Key: xase_pk_abc123...
```

Copie a key e use nas variáveis de ambiente.

---

## 🌍 Variáveis de Ambiente

### .env (recomendado)

```bash
# .env
XASE_API_KEY=xase_pk_abc123...
XASE_BASE_URL=http://localhost:3000/api/xase/v1
NODE_ENV=development
```

### Carregar com dotenv

```bash
npm install dotenv
```

```javascript
// app.js
require('dotenv').config()
const { XaseClient } = require('@xase/sdk-js')

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY,
  baseUrl: process.env.XASE_BASE_URL,
})
```

---

## 🚀 Quick Start

### JavaScript (CommonJS)

```javascript
const { XaseClient } = require('@xase/sdk-js')

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY,
})

async function main() {
  await xase.record({
    policy: 'credit_policy_v4',
    input: { user_id: 'u_001', amount: 50000 },
    output: { decision: 'APPROVED' },
    confidence: 0.94,
  })
  
  await xase.flush()
  console.log('✅ Evidence recorded!')
}

main()
```

---

### TypeScript (ESM)

```typescript
import { XaseClient } from '@xase/sdk-js'

const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
})

async function main() {
  await xase.record({
    policy: 'credit_policy_v4',
    input: { user_id: 'u_001', amount: 50000 },
    output: { decision: 'APPROVED' },
    confidence: 0.94,
  })
  
  await xase.flush()
  console.log('✅ Evidence recorded!')
}

main()
```

---

## 🧪 Testar Integração

### 1. Iniciar servidor Xase

```bash
# Terminal 1
npm run dev
```

### 2. Criar API Key

```bash
# Terminal 2
node database/seed-demo-data.js
```

Copie a API key gerada.

### 3. Testar SDK

```bash
# Terminal 2
cd packages/sdk-js
npm run build

# Criar arquivo de teste
cat > test-integration.js << 'EOF'
const { XaseClient } = require('./dist/index.js')

const xase = new XaseClient({
  apiKey: 'COLE_SUA_API_KEY_AQUI',
  baseUrl: 'http://localhost:3000/api/xase/v1',
  fireAndForget: false, // Modo síncrono para ver resultado
})

async function test() {
  try {
    const result = await xase.record({
      policy: 'test_policy_v1',
      input: { test: 'input' },
      output: { test: 'output' },
      confidence: 0.99,
    })
    
    console.log('✅ Success!')
    console.log('Transaction ID:', result.transaction_id)
    console.log('Record Hash:', result.record_hash)
    console.log('Receipt URL:', result.receipt_url)
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

test()
EOF

# Rodar teste
node test-integration.js
```

**Output esperado:**
```
✅ Success!
Transaction ID: txn_abc123...
Record Hash: a3f9c2...
Receipt URL: http://localhost:3000/xase/receipt/txn_abc123...
```

---

## 📊 Verificar no Dashboard

1. Acesse `http://localhost:3000/xase/records`
2. Você deve ver o record criado
3. Verifique os detalhes: policy, confidence, timestamp

---

## 🐛 Troubleshooting

### "Cannot find module '@xase/sdk-js'"

**Causa:** SDK não foi instalado ou linked.

**Fix:**
```bash
cd packages/sdk-js
npm run build
npm link

cd /path/to/your/project
npm link @xase/sdk-js
```

---

### "Missing X-API-Key header"

**Causa:** API key não foi fornecida.

**Fix:**
```javascript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY, // Certifique-se que está definido
})
```

---

### "Invalid API key"

**Causa:** API key inválida ou expirada.

**Fix:**
1. Gere nova key no dashboard
2. Ou rode `node database/seed-demo-data.js`
3. Atualize `.env`

---

### "ECONNREFUSED"

**Causa:** Servidor Xase não está rodando.

**Fix:**
```bash
# Terminal 1
npm run dev
```

---

### Build errors

**Causa:** Dependências não instaladas.

**Fix:**
```bash
cd packages/sdk-js
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📝 Próximos Passos

1. ✅ SDK instalado e funcionando
2. ✅ API key configurada
3. ✅ Primeiro record criado

**Agora você pode:**
- Integrar no seu app de produção
- Explorar exemplos em `examples/`
- Ler documentação completa em `DOCUMENTATION.md`
- Customizar configurações

---

## 🔗 Links Úteis

- **README:** Guia de uso completo
- **DOCUMENTATION:** Documentação técnica detalhada
- **Examples:** Exemplos práticos
- **Dashboard:** `http://localhost:3000/xase`

---

## 💡 Dicas

### Desenvolvimento

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'http://localhost:3000/api/xase/v1',
  fireAndForget: false, // Ver erros imediatamente
  onError: console.error,
  onSuccess: console.log,
})
```

### Produção

```typescript
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'https://api.xase.ai/v1',
  fireAndForget: true, // Zero latency
  timeout: 5000,
  maxRetries: 5,
})
```

---

## 🎉 Pronto!

Seu SDK está configurado e pronto para uso.

Para dúvidas, consulte:
- `README.md` - Guia de uso
- `DOCUMENTATION.md` - Documentação técnica
- `examples/` - Exemplos práticos

---

## 🏭 Produção (Guia Rápido)

- **Base URL**: use `https://api.xase.ai/v1`.
- **Autenticação**: header `X-API-Key` (não exponha em cliente/browser).
- **Modo**: `fireAndForget: true` para zero latência no hot-path.
- **Timeout**: 5s. **Retries**: 3–5 com backoff exponencial.
- **Idempotência**: sempre envie `transactionId` (ex.: ID do pedido/loan).

```ts
import { XaseClient } from '@xase/sdk-js'

export const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'https://api.xase.ai/v1',
  fireAndForget: true,
  timeout: 5000,
  maxRetries: 5,
})
```

### Variáveis em Produção

```bash
XASE_API_KEY= xase_pk_prod_...
XASE_BASE_URL= https://api.xase.ai/v1
NODE_ENV= production
XASE_QUEUE_MAX_SIZE= 50000   # opcional
XASE_MAX_RETRIES= 5          # opcional
XASE_TIMEOUT_MS= 5000        # opcional
```

### Segurança

- **Secrets** em vault (AWS Secrets Manager, GCP Secret Manager, Doppler, 1Password).
- **HTTPS** obrigatório. Não envie payloads sensíveis sem redaction.
- Use `storePayload: false` por padrão; habilite somente quando necessário.
- Rotacione a API Key periodicamente (90 dias) e com escopo mínimo.

### Observabilidade

- **Callbacks** `onSuccess`/`onError` para métricas e logs estruturados.
- Exporte contadores: `xase.records.success`, `xase.records.error`, `xase.queue.size`.
- Log de erros com `error.code`, `statusCode`, `retryCount`.

```ts
const xase = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
  baseUrl: 'https://api.xase.ai/v1',
  fireAndForget: true,
  onSuccess: (r) => metrics.increment('xase.records.success'),
  onError: (e) => {
    metrics.increment('xase.records.error')
    logger.error({ code: e.code, status: e.statusCode }, 'xase error')
  },
})
```

### Boas Práticas de Deploy

- Chame `xase.flush(2_000)` em shutdown gracioso (SIGTERM) para drenar a fila.
- Em serverless (AWS Lambda, Vercel, Cloudflare): use modo síncrono no final da execução ou `flush` antes do retorno.
- Escale `queueMaxSize` conforme throughput; prefira backpressure a perder evidências.

### SLOs sugeridos

- 99.9% sucesso na ingestão (com retries).
- <200ms P95 para chamada síncrona (rede/latência variável).
- 0 perdas no shutdown com `flush` > 2s e fila < 10k itens.

---

## 📘 Manual Operacional

- **Rotina diária**
  - **[monitorar]** taxas de sucesso/erro e tamanho da fila.
  - **[auditar]** amostras de recibos no dashboard (`/xase/records`).
  - **[rotacionar]** API keys e revisar permissões.

- **Incidentes comuns**
  - **RATE_LIMIT_EXCEEDED (429)**: reduzir taxa, aumentar retries, implementar backpressure.
  - **MAX_RETRIES**: verificar conectividade e status do serviço Xase.
  - **QUEUE_FULL**: aumentar `queueMaxSize`, reduzir taxa, mover para batch.

- **Playbooks**
  - **Queda de upstream**: alternar para modo síncrono com retries agressivos em caminhos críticos; registrar fallback local.
  - **Latência alta**: manter fire-and-forget; somente sincronizar em trechos fora do hot-path.
  - **Compliance**: ativar `storePayload: true` apenas para fluxos auditáveis e mascarar PII.

### Exemplos de Integração (Produção)

Express (Node):

```ts
app.post('/checkout', async (req, res) => {
  // ... lógica de decisão
  xase.record({
    policy: 'checkout_risk_v3',
    input: { userId: req.user.id, cart: req.body.cart },
    output: { decision: 'APPROVED' },
    confidence: 0.92,
    transactionId: req.body.orderId,
  })
  res.status(201).send({ ok: true })
})
```

NestJS (Interceptor/Service): chame `xase.record()` no service de domínio; use `OnModuleDestroy` para `flush()`.

---

## 🌐 Outras linguagens (Ruby)

Para MVP, use um cliente HTTP fino no Ruby/Rails (sem gem oficial ainda):

```ruby
# Gemfile
# gem 'faraday', '~> 2.10'

require 'faraday'

class XaseClient
  def initialize(api_key:, base_url: ENV['XASE_BASE_URL'] || 'https://api.xase.ai/v1', timeout: 5)
    @api_key = api_key
    @conn = Faraday.new(url: base_url, request: { timeout: timeout }) do |f|
      f.request :json
      f.response :json, content_type: 'application/json'
      # f.request :retry, max: 3, interval: 0.1, backoff_factor: 2.0  # opcional
      f.adapter Faraday.default_adapter
    end
  end

  def record(policy:, input:, output:, confidence: nil, context: nil, transaction_id: nil, store_payload: nil)
    headers = { 'X-API-Key' => @api_key }
    headers['Idempotency-Key'] = transaction_id if transaction_id

    body = {
      policyId: policy,
      input: input,
      output: output,
      confidence: confidence,
      context: context,
      storePayload: store_payload
    }.compact

    @conn.post('/records', body, headers).body
  end
end
```

Uso (Rails Controller):

```ruby
xase = XaseClient.new(api_key: ENV['XASE_API_KEY'])
xase.record(
  policy: 'credit_policy_v4',
  input: { user_id: current_user.id, amount: 50000 },
  output: { decision: 'APPROVED' },
  confidence: 0.94,
  transaction_id: params[:order_id]
)
```

Quando houver demanda confirmada, evoluir para uma gem `xase-sdk` com fila e retries nativos.

---

## 📦 Export de Prova (Evidence Bundle)

Exporte um ZIP verificável para uma decisão específica (auditoria/legal):

- **Endpoint**: `GET /api/xase/v1/export/:transactionId/download`
- **Retorna**: `application/zip` com
  - `decision.json`
  - `proof.json`
  - `verify.js`
  - `payloads/*.json` (se armazenados e habilitado no backend)

### Como usar (via curl)

```bash
curl -H "X-API-Key: $XASE_API_KEY" \
  -L -o evidence_txn_abc123.zip \
  "$BASE_URL/api/xase/v1/export/txn_abc123/download"
```

### Verificar offline

```bash
unzip evidence_txn_abc123.zip -d ./evidence
cd evidence
node verify.js  # requer Node 18+
```

### Observações

- Caso `storePayload=false`, o bundle inclui apenas hashes dos payloads.
- A assinatura usa chave do KMS (mock/real). A verificação de assinatura depende da chave pública disponível em `proof.json`.

---
