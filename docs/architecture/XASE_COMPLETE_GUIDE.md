# XASE — Guia Completo de Implementação

## Visão Geral

A XASE é uma camada de evidência para decisões de IA que transforma cada decisão automatizada em um registro legal verificável e imutável. Este guia documenta a implementação completa do sistema, incluindo storage MinIO/S3, UI de download seguro e histórico de bundles.

---

## Índice

1. [Arquitetura](#arquitetura)
2. [Componentes Implementados](#componentes-implementados)
3. [Storage MinIO/S3](#storage-minios3)
4. [API e Rotas](#api-e-rotas)
5. [Interface de Usuário](#interface-de-usuário)
6. [Fluxo Completo](#fluxo-completo)
7. [Segurança e Compliance](#segurança-e-compliance)
8. [Testes e Validação](#testes-e-validação)
9. [Próximos Passos](#próximos-passos)

---

## Arquitetura

### Camadas do Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  - Records List (/xase/records)                         │
│  - Record Details (/xase/records/[id])                  │
│  - Download Button (server-side, sem expor API key)     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Server-side API Routes                      │
│  - /api/records/[id]/evidence (download seguro)         │
│  - /api/records/[id]/bundles (listar bundles)           │
│  - /api/xase/v1/export/[id]/download (API pública)      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  Core Services                           │
│  - storage.ts (MinIO/S3 client)                         │
│  - export.ts (bundle generation)                        │
│  - signing-service.ts (KMS + assinatura)                │
│  - audit.ts (trilha de auditoria)                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Persistence Layer                           │
│  - DecisionRecord (ledger de decisões)                  │
│  - EvidenceBundle (metadata de bundles)                 │
│  - CheckpointRecord (âncoras de integridade)            │
│  - AuditLog (trilha imutável)                           │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                External Storage                          │
│  - MinIO/S3 (bundles ZIP)                               │
│  - Object Lock (WORM, retenção legal)                   │
│  - Lifecycle (expiração automática)                     │
└─────────────────────────────────────────────────────────┘
```

---

## Componentes Implementados

### 1. Storage Client (`src/lib/xase/storage.ts`)

**Funcionalidades:**
- Upload de buffer para MinIO/S3
- Geração de URL assinado (pre-signed) com validade de 1h
- Detecção automática de configuração
- Suporte a endpoint customizado (MinIO) e AWS S3

**Métodos principais:**
```typescript
uploadBuffer(key, buffer, contentType) → { url, key, size, hash }
getPresignedUrl(key, expiresInSeconds) → string
isStorageConfigured() → boolean
```

### 2. Export Service (`src/lib/xase/export.ts`)

**Funcionalidades:**
- Geração de proof bundle (decision.json, proof.json, verify.js, etc)
- Suporte a `includePayloads` (full ou hashes-only)
- Assinatura criptográfica via KMS
- Auditoria de export

### 3. Rota de Download Pública (`src/app/api/xase/v1/export/[id]/download/route.ts`)

**Funcionalidades:**
- Parametrização: `?include_payloads=true|false`, `?download=stream|redirect|json`
- Cache/reuso: busca `EvidenceBundle` existente
- Upload automático para MinIO/S3
- Persistência em `EvidenceBundle`
- Retorno via URL assinado ou stream

**Exemplo de uso:**
```bash
# JSON com URL assinado
curl -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=json"

# Redirect direto
curl -L -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=redirect" \
  --output evidence.zip
```

### 4. Handler Server-side Seguro (`src/app/api/records/[id]/evidence/route.ts`)

**Funcionalidades:**
- Autenticação via sessão (Next-Auth)
- Validação de tenant
- Não expõe `X-API-Key` no browser
- Gera URL assinado e faz redirect 302
- Auditoria de acesso

**Uso na UI:**
```typescript
// No componente React
window.location.href = `/api/records/${transactionId}/evidence?include_payloads=true&mode=redirect`;
```

### 5. API de Listagem de Bundles (`src/app/api/records/[id]/bundles/route.ts`)

**Funcionalidades:**
- Lista todos os bundles de um record
- Retorna metadata: bundleId, size, hash, createdAt, accessedAt
- Autenticação via sessão

### 6. Página de Detalhes do Record (`src/app/xase/records/[id]/page.tsx`)

**Funcionalidades:**
- Exibe informações completas do record
- Botão de download com seletor de tipo (Full/Hashes)
- Histórico de bundles gerados
- Informações de checkpoint mais próximo
- Hashes criptográficos

### 7. Componente RecordDetails (`src/components/xase/RecordDetails.tsx`)

**Funcionalidades:**
- UI moderna e consistente (dark theme)
- Download seguro via handler server-side
- Tabela de histórico de bundles
- Exibição de hashes e checkpoint
- Indicadores de status (Verified/Pending)

---

## Storage MinIO/S3

### Configuração

**Variáveis de ambiente (`.env.local`):**
```bash
MINIO_SERVER_URL=https://aa-minio44.dpbdp1.easypanel.host
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=password
BUCKET_NAME=xase
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

### Estrutura de Chaves

```
evidence/
  ├── txn_abc123_full.zip      (com payloads)
  ├── txn_abc123_hashes.zip    (somente hashes)
  └── txn_xyz789_full.zip
```

### Metadata do Objeto

Cada objeto no storage contém:
- `x-xase-hash`: SHA-256 do bundle
- `x-xase-uploaded-at`: timestamp do upload

### Retenção e Compliance

**Object Lock (WORM):**
```bash
mc retention set --default COMPLIANCE 7d xase/evidence/
```

**Lifecycle (expiração):**
```json
{
  "Rules": [{
    "ID": "ExpireOldBundles",
    "Status": "Enabled",
    "Expiration": { "Days": 2555 },
    "Filter": { "Prefix": "evidence/" }
  }]
}
```

**Legal Hold:**
Marcado em `EvidenceBundle.legalHold` e `retentionUntil`.

---

## API e Rotas

### Rota Pública (API Key)

**`GET /api/xase/v1/export/[id]/download`**

**Query params:**
- `include_payloads`: `true|false` (default: true)
- `download`: `stream|redirect|json` (default: stream)

**Resposta (modo JSON):**
```json
{
  "bundle_id": "bundle_9ead...",
  "transaction_id": "txn_074e...",
  "presigned_url": "https://...",
  "expires_in": 3600,
  "size": 6659,
  "hash": "e1a43a...",
  "cached": true
}
```

### Rota Server-side (Sessão)

**`GET /api/records/[id]/evidence`**

**Query params:**
- `include_payloads`: `true|false`
- `mode`: `redirect|json`

**Comportamento:**
- Valida sessão e tenant
- Busca bundle em `EvidenceBundle`
- Gera URL assinado
- Faz redirect 302 ou retorna JSON

### Rota de Listagem

**`GET /api/records/[id]/bundles`**

**Resposta:**
```json
{
  "transaction_id": "txn_074e...",
  "bundles": [
    {
      "bundle_id": "bundle_9ead...",
      "storage_key": "evidence/txn_074e_full.zip",
      "bundle_hash": "e1a43a...",
      "bundle_size": 6659,
      "includes_payloads": true,
      "created_at": "2025-12-16T23:07:32Z"
    }
  ],
  "total": 1
}
```

---

## Interface de Usuário

### Página de Listagem (`/xase/records`)

**Funcionalidades:**
- Tabela com todos os records do tenant
- Colunas: Transaction ID, Policy, Type, Confidence, Timestamp, Status
- Ação: "View Details" (link para página de detalhes)

### Página de Detalhes (`/xase/records/[id]`)

**Seções:**

1. **Header**
   - Breadcrumb (← Records / Record Details)
   - Transaction ID
   - Seletor de tipo de download (Full/Hashes)
   - Botão "Download Evidence"

2. **Decision Info**
   - Transaction ID, Policy ID/Version
   - Decision Type, Confidence
   - Timestamp, Status (Verified/Pending)

3. **Cryptographic Proof**
   - Record Hash, Input Hash, Output Hash
   - Context Hash (se houver)
   - Previous Hash (chain)

4. **Nearest Checkpoint**
   - Checkpoint ID, Timestamp, Key ID
   - Checkpoint Hash

5. **Evidence Bundles (histórico)**
   - Tabela: Bundle ID, Type (Full/Hashes), Size, Hash, Created, Last Access
   - Indica se bundle foi acessado e quando

**Design:**
- Dark theme (`bg-[#0a0a0a]`)
- Cards com `bg-white/[0.03]` e `border-white/[0.08]`
- Ícones Lucide (Download, FileText, Shield, Clock, Hash)
- Badges de status coloridos

---

## Fluxo Completo

### 1. Ingestão de Decisão

```bash
POST /api/xase/v1/ingest
{
  "input": { "user_id": "u_123", "amount": 5000 },
  "output": { "decision": "APPROVED" },
  "context": { "ip": "192.168.1.1" },
  "policy_id": "credit_policy_v1",
  "decision_type": "loan_approval",
  "confidence": 0.95
}
```

**Resultado:**
- Cria `DecisionRecord` com hashes
- Encadeia com `previousHash`
- Retorna `transaction_id`

### 2. Geração de Bundle (primeira vez)

**Via API pública:**
```bash
curl -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=json"
```

**Processo:**
1. Gera bundle ZIP (decision.json, proof.json, verify.js, payloads/*, policy.json, report.txt)
2. Calcula SHA-256 do ZIP
3. Upload para MinIO (`evidence/txn_abc_full.zip`)
4. Cria registro em `EvidenceBundle`
5. Registra `BUNDLE_STORED` em `AuditLog`
6. Gera URL assinado (1h de validade)
7. Registra `BUNDLE_DOWNLOADED` em `AuditLog`
8. Retorna JSON com `presigned_url`

### 3. Download via UI

**Usuário clica em "Download Evidence":**
1. Frontend chama `/api/records/txn_abc/evidence?include_payloads=true&mode=redirect`
2. Handler valida sessão e tenant
3. Busca bundle em `EvidenceBundle`
4. Gera novo URL assinado
5. Registra `BUNDLE_DOWNLOADED` em `AuditLog`
6. Faz redirect 302 para URL assinado
7. Browser baixa ZIP do MinIO

### 4. Reuso (segunda chamada)

**Chamada subsequente:**
```bash
curl -H "X-API-Key: $KEY" \
  "$BASE_URL/api/xase/v1/export/txn_abc/download?download=json"
```

**Processo:**
1. Busca bundle existente em `EvidenceBundle`
2. Gera novo URL assinado (não regenera ZIP)
3. Retorna JSON com `cached: true`

### 5. Verificação Offline

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

## Segurança e Compliance

### Autenticação e Autorização

- **API pública**: `X-API-Key` com permissões (`ingest`, `verify`, `export`)
- **UI**: Next-Auth session + validação de `tenantId`
- **Isolamento**: cada tenant só acessa seus próprios records

### Criptografia

- **Hashes**: SHA-256 canônico (JSON ordenado)
- **Assinatura**: KMS (mock em dev, AWS KMS em prod)
- **Chain**: cada record referencia `previousHash`
- **Checkpoint**: assinatura periódica do ledger

### Auditoria

**Eventos registrados:**
- `EXPORT_CREATED`: bundle gerado
- `BUNDLE_STORED`: upload para storage
- `BUNDLE_DOWNLOADED`: URL assinado gerado
- `KEY_ACCESSED`, `CHECKPOINT_CREATED`, etc

**Campos:**
- `tenantId`, `userId`, `action`, `resourceType`, `resourceId`
- `metadata` (JSON com detalhes), `ipAddress`, `userAgent`
- `status` (SUCCESS/FAILED/DENIED)

### Imutabilidade

- **AuditLog**: trigger SQL impede UPDATE/DELETE
- **DecisionRecord**: chain de hashes
- **Storage**: Object Lock (WORM) no bucket

#### EvidenceBundle (Imutável)
- **Create-only**: `EvidenceBundle` nunca é atualizado ou deletado após criado.
- **Last Access**: derivado de `AuditLog` (`BUNDLE_DOWNLOADED`); não há atualização de `accessedAt` no modelo.

### LGPD/GDPR

- **Export sem payloads**: `include_payloads=false` (somente hashes)
- **DSR**: eventos `DSR_REQUEST`, `DSR_FULFILLED`
- **Retenção**: `retentionUntil` e `legalHold` em `EvidenceBundle`

---

## Testes e Validação

### Teste 1: Download com cache (redirect)

```bash
export BASE_URL="http://localhost:3000"
export XASE_API_KEY="xase_pk_..."

curl -L -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?download=redirect" \
  --output evidence.zip

unzip -o evidence.zip -d evidence && cd evidence && node verify.js
```

**Resultado esperado:**
```
✓ Hash match: true
✓ Signature valid: true
```

### Teste 2: Verificar cache

```bash
curl -sS -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?download=json"
```

**Resultado esperado:**
```json
{
  "cached": true,
  "presigned_url": "https://...",
  ...
}
```

### Teste 3: Download sem payloads

```bash
curl -L -H "X-API-Key: $XASE_API_KEY" \
  "$BASE_URL/api/xase/v1/export/txn_074e4ced98a889b919737878717687e8/download?include_payloads=false&download=redirect" \
  --output evidence_hashes.zip
```

**Resultado:** ZIP menor (sem `payloads/input.json`, etc).

### Teste 4: UI Download

1. Acesse `http://localhost:3000/xase/records`
2. Clique em "View Details" em um record
3. Selecione "Full Bundle" ou "Hashes Only"
4. Clique em "Download Evidence"
5. Verifique download do ZIP

### Teste 5: Histórico de Bundles

1. Na página de detalhes, role até "Evidence Bundles"
2. Verifique tabela com bundles gerados
3. Confirme `Last Access` atualizado após download

---

## Próximos Passos

### Curto Prazo

- [ ] **Rate limit/quotas**: limitar exports por tenant/hora
- [ ] **CORS no MinIO**: se download direto do browser
- [ ] **TLS válido**: certificado no `MINIO_SERVER_URL`
- [ ] **Higiene**: `npm audit fix` para vulnerabilidades

### Médio Prazo

- [ ] **KMS de produção**: `XASE_KMS_TYPE=aws` + `XASE_KMS_KEY_ID`
- [ ] **Pin de fingerprint**: publicar chave pública oficial em docs/site
- [ ] **TSA (carimbo de tempo)**: RFC3161 em `CheckpointRecord`
- [ ] **Job de export**: cron para decisões críticas

### Longo Prazo

- [ ] **PDF no bundle**: relatório visual para auditores
- [ ] **SDK Python**: decorator `@xase.record(policy=...)`
- [ ] **Painel de métricas**: exports/downloads por tenant
- [ ] **Alertas**: falha de assinatura, budget de storage

---

## Estrutura de Arquivos

```
src/
├── app/
│   ├── api/
│   │   ├── records/
│   │   │   └── [id]/
│   │   │       ├── evidence/route.ts      # Download seguro (sessão)
│   │   │       └── bundles/route.ts       # Listar bundles
│   │   └── xase/v1/
│   │       ├── ingest/route.ts            # Ingestão de decisões
│   │       ├── verify/route.ts            # Verificação de hash
│   │       └── export/[id]/download/route.ts  # Export público (API key)
│   └── xase/
│       ├── records/
│       │   ├── page.tsx                   # Listagem de records
│       │   └── [id]/page.tsx              # Detalhes do record
│       ├── api-keys/page.tsx
│       ├── audit/page.tsx
│       └── checkpoints/page.tsx
├── components/
│   └── xase/
│       └── RecordDetails.tsx              # Componente de detalhes
├── lib/
│   └── xase/
│       ├── storage.ts                     # Cliente MinIO/S3
│       ├── export.ts                      # Geração de bundle
│       ├── signing-service.ts             # Assinatura KMS
│       ├── audit.ts                       # Trilha de auditoria
│       ├── crypto.ts                      # Hashes canônicos
│       ├── auth.ts                        # Validação de API key
│       └── server-auth.ts                 # Auth server-side
└── prisma/
    └── schema.prisma                      # Modelos de dados

docs/
├── XASE_COMPLETE_GUIDE.md                 # Este arquivo
├── XASE_NEXT_STEPS.md                     # Roadmap detalhado
├── MINIO_STORAGE_SETUP.md                 # Setup MinIO/S3
└── IMPLEMENTATION_SUMMARY.md              # Resumo de implementação
```

---

## Referências

- **MinIO**: https://min.io/docs/
- **AWS S3 SDK v3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/
- **Pre-signed URLs**: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- **Next.js API Routes**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- **Next-Auth**: https://next-auth.js.org/

---

## Suporte

Para dúvidas ou problemas:
1. Consulte `docs/MINIO_STORAGE_SETUP.md` para troubleshooting de storage
2. Verifique logs do servidor (`console.error` em handlers)
3. Confirme variáveis de ambiente em `.env.local`
4. Teste rotas via `curl` antes de usar a UI

---

**Status:** ✅ Implementação completa e funcional

**Última atualização:** 16 de dezembro de 2025
