# XASE — The Evidence Layer for AI Decisions

> **Transform automated decisions into immutable legal records.**

XASE é uma camada de evidência que transforma cada decisão de IA em um registro verificável, auditável e independente. Enquanto empresas correm para usar IA em decisões críticas (crédito, fraude, saúde, RH), não existe um padrão confiável para provar o que foi decidido, por qual modelo, sob qual política e com qual supervisão humana.

---

## 🎯 O Problema

Empresas estão colocando IA para decidir:
- Quem recebe crédito
- Quem é bloqueado por fraude
- Quem é contratado ou demitido
- Quem recebe um tratamento médico
- Quem tem uma conta suspensa

**Mas quando alguém pergunta: "Por que essa decisão foi tomada?"**

A resposta hoje é fraca:
- ❌ Logs frágeis
- ❌ Prompts soltos
- ❌ Versões de modelo perdidas
- ❌ Políticas não versionadas
- ❌ Nenhuma prova criptográfica
- ❌ Nenhuma verificação independente

Isso cria **risco jurídico, regulatório e reputacional**, especialmente com:
- EU AI Act
- LGPD / GDPR
- Processos de consumidores
- Auditorias e due diligence
- Contratos enterprise

---

## ✅ A Solução: XASE

A XASE é uma **camada de evidência** que roda junto do sistema do cliente. Sempre que uma IA toma uma decisão, a empresa registra na XASE:

```typescript
import { xase } from '@/lib/xase';

// Registrar decisão
const receipt = await xase.ingest({
  input: { user_id: "u_123", amount: 5000 },
  output: { decision: "APPROVED" },
  context: { ip: "192.168.1.1" },
  policy_id: "credit_policy_v1",
  decision_type: "loan_approval",
  confidence: 0.95
});
```

A XASE então:
1. ✅ Gera um **hash canônico** da decisão
2. ✅ Cria uma **assinatura criptográfica** (KMS)
3. ✅ Encadeia isso num **ledger imutável**
4. ✅ Permite exportar um **bundle verificável offline**

**Resultado:** 👉 a decisão vira prova, não opinião.

---

## 📦 O que a Prova Contém

Cada evidência exportada inclui:

- **`decision.json`** → o que foi decidido
- **`policy.json`** → regra/política vigente naquele momento
- **`proof.json`** → hash, assinatura, fingerprint público
- **`payloads/`** → input, output, context (opcional)
- **`verify.js`** → script de verificação offline
- **`report.txt`** → relatório human-readable

Qualquer auditor, cliente ou juiz pode verificar:
- ✅ Que o conteúdo não foi alterado
- ✅ Quando foi assinado
- ✅ Com qual chave
- ✅ Sem depender da XASE estar online

---

## 🚀 Quick Start

### 1. Instalação

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 2. Configuração

Adicione ao `.env.local`:

```bash
# Database
DATABASE_URL=postgres://...

# XASE KMS (desenvolvimento)
XASE_KMS_TYPE=mock
XASE_MOCK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----..."
XASE_MOCK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."

# MinIO/S3 Storage
MINIO_SERVER_URL=https://your-minio-server.com
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=password
BUCKET_NAME=xase
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

### 3. Criar Bucket

Acesse o console MinIO e crie o bucket `xase`.

### 4. Iniciar Servidor

```bash
npm run dev
```

### 5. Registrar Decisão

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "X-API-Key: $XASE_API_KEY" \
  -d '{
    "input": {"user_id": "u_123", "amount": 5000},
    "output": {"decision": "APPROVED"},
    "policy_id": "credit_policy_v1"
  }' \
  "http://localhost:3000/api/xase/v1/ingest"
```

### 6. Baixar Evidência

```bash
curl -L -H "X-API-Key: $XASE_API_KEY" \
  "http://localhost:3000/api/xase/v1/export/txn_abc123/download?download=redirect" \
  --output evidence.zip
```

### 7. Verificar Offline

```bash
unzip evidence.zip -d evidence
cd evidence
node verify.js
```

**Saída:**
```
✓ Hash match: true
✓ Signature valid: true
ℹ️ Key fingerprint: bc6bd0930edf0299...
```

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────┐
│         Frontend (Next.js)              │
│  - Records List                         │
│  - Record Details + Download Button     │
│  - Evidence Bundles History             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         API Routes (Server-side)        │
│  - /api/xase/v1/ingest                  │
│  - /api/xase/v1/export/[id]/download    │
│  - /api/records/[id]/evidence           │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│            Core Services                │
│  - storage.ts (MinIO/S3)                │
│  - export.ts (bundle generation)        │
│  - signing-service.ts (KMS)             │
│  - audit.ts (immutable log)             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Persistence (Prisma)            │
│  - DecisionRecord (ledger)              │
│  - EvidenceBundle (metadata)            │
│  - CheckpointRecord (anchors)           │
│  - AuditLog (WORM)                      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│       External Storage (MinIO/S3)       │
│  - Bundles ZIP                          │
│  - Object Lock (WORM)                   │
│  - Lifecycle (retention)                │
└─────────────────────────────────────────┘
```

---

## 🎨 Interface de Usuário

### Listagem de Records

![Records List](https://via.placeholder.com/800x400?text=Records+List)

- Tabela com todos os records do tenant
- Filtros por policy, tipo, data
- Link para detalhes

### Detalhes do Record

![Record Details](https://via.placeholder.com/800x600?text=Record+Details)

- Informações da decisão (policy, confidence, timestamp)
- Hashes criptográficos (input, output, record, chain)
- Checkpoint mais próximo
- Botão de download (Full/Hashes)
- Histórico de bundles gerados

---

## 🔐 Segurança e Compliance

### Autenticação
- **API pública**: `X-API-Key` com permissões granulares
- **UI**: Next-Auth session + validação de tenant
- **Isolamento**: cada tenant só acessa seus próprios records

### Criptografia
- **Hashes**: SHA-256 canônico (JSON ordenado)
- **Assinatura**: KMS (mock em dev, AWS KMS em prod)
- **Chain**: cada record referencia `previousHash`
- **Checkpoint**: assinatura periódica do ledger

### Auditoria
- **Eventos**: `EXPORT_CREATED`, `BUNDLE_STORED`, `BUNDLE_DOWNLOADED`
- **Imutabilidade**: trigger SQL impede UPDATE/DELETE em `AuditLog`
- **Metadata**: tenantId, userId, action, resourceType, timestamp

### Imutabilidade de EvidenceBundle
- **Create-only**: `EvidenceBundle` nunca é atualizado ou deletado após criado.
- **Acessos**: o "Last Access" é inferido via `AuditLog` (`BUNDLE_DOWNLOADED`), não por `accessedAt` no modelo.

### LGPD/GDPR
- **Export sem payloads**: `include_payloads=false` (somente hashes)
- **Retenção**: `retentionUntil` e `legalHold` em `EvidenceBundle`
- **DSR**: eventos `DSR_REQUEST`, `DSR_FULFILLED`

---

## 📚 Documentação

- **[Guia Completo](./XASE_COMPLETE_GUIDE.md)** - Arquitetura, fluxos e referências
- **[Setup MinIO/S3](./MINIO_STORAGE_SETUP.md)** - Configuração de storage
- **[Roadmap](./XASE_NEXT_STEPS.md)** - Próximos passos e melhorias
- **[Resumo de Implementação](./IMPLEMENTATION_SUMMARY.md)** - Status e testes

---

## 🧪 Testes

### Teste 1: Ingestão e Export

```bash
# 1. Registrar decisão
curl -X POST -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"user":"u_1"},"output":{"decision":"OK"}}' \
  "$BASE_URL/api/xase/v1/ingest"

# 2. Exportar evidência
curl -L -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=redirect" \
  --output evidence.zip

# 3. Verificar
unzip evidence.zip -d evidence && cd evidence && node verify.js
```

### Teste 2: Cache

```bash
# Primeira chamada: cached=false
curl -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=json"

# Segunda chamada: cached=true
curl -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=json"
```

### Teste 3: UI Download

1. Acesse `http://localhost:3000/xase/records`
2. Clique em "View Details" em um record
3. Selecione "Full Bundle" ou "Hashes Only"
4. Clique em "Download Evidence"
5. Verifique download do ZIP

---

## 🛠️ Stack Tecnológica

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL + Prisma
- **Storage**: MinIO / AWS S3
- **Auth**: Next-Auth
- **KMS**: AWS KMS (produção) / Mock (desenvolvimento)
- **UI**: React + TailwindCSS + Lucide Icons
- **Crypto**: Node.js crypto (SHA-256, assinatura)

---

## 🚦 Status do Projeto

### ✅ Implementado

- Ledger de decisões com hashes e chain
- Assinatura criptográfica (KMS mock + AWS KMS)
- Export verificável offline
- Storage MinIO/S3 com URL assinado
- UI de download segura (sem expor API key)
- Histórico de bundles por record
- Auditoria completa (BUNDLE_STORED, BUNDLE_DOWNLOADED)
- Parametrização (include_payloads, download mode)
- Cache e reuso de bundles

### 🚧 Em Desenvolvimento

- KMS de produção (AWS)
- Rate limit e quotas por tenant
- TSA (carimbo de tempo RFC3161)
- Jobs de export automático
- Painel de métricas

### 📋 Roadmap

- PDF no bundle (relatório visual)
- SDK Python (`@xase.record(policy=...)`)
- Human-in-the-loop UI
- Alertas e monitoramento
- Lifecycle/retention no bucket

---

## 🤝 Contribuindo

Este é um projeto interno. Para dúvidas ou sugestões:
1. Consulte a documentação em `docs/`
2. Verifique logs do servidor
3. Confirme variáveis de ambiente

---

## 📄 Licença

Proprietary - Uso interno

---

## 🔗 Links Úteis

- **MinIO**: https://min.io/docs/
- **AWS S3 SDK**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/
- **Next.js**: https://nextjs.org/docs
- **Prisma**: https://www.prisma.io/docs

---

**XASE** — Transformando decisões de IA em evidência legal.

**Última atualização:** 16 de dezembro de 2025
