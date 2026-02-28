# 📚 XASE Sheets - Documentação Técnica

**Versão:** 3.0.0  
**Última Atualização:** 27 de Fevereiro de 2024

> **Documentação completa do XASE Sheets - Plataforma de Gestão de Dados Médicos**

Esta pasta contém toda a documentação técnica, arquitetura, guias de implementação e compliance do sistema XASE Sheets.

---

## 🗂️ Estrutura da Documentação

A documentação está organizada em **7 categorias principais**:

### 📁 Raiz (21 arquivos)

**Arquitetura (4 arquivos):**
- [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - Diagramas de arquitetura
- [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) - Arquitetura do backend
- [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) - Arquitetura do frontend
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - Arquitetura do sistema

**Sidecar (3 arquivos):**
- [SIDECAR_COMPLETE_ARCHITECTURE.md](./SIDECAR_COMPLETE_ARCHITECTURE.md) - Arquitetura completa
- [SIDECAR_DEPLOYMENT_COMPLETE_GUIDE.md](./SIDECAR_DEPLOYMENT_COMPLETE_GUIDE.md) - Guia de deployment
- [SIDECAR_QUICKSTART.md](./SIDECAR_QUICKSTART.md) - Quick start

**Billing (2 arquivos):**
- [BILLING_HYBRID_SYSTEM.md](./BILLING_HYBRID_SYSTEM.md) - Sistema híbrido
- [BILLING_SETUP_QUICKSTART.md](./BILLING_SETUP_QUICKSTART.md) - Setup rápido

**Documentação Técnica (4 arquivos):**
- [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md) - Documentação técnica
- [XASE_COMPLETE_SYSTEM_DOCUMENTATION.md](./XASE_COMPLETE_SYSTEM_DOCUMENTATION.md) - Sistema completo
- [LEGAL_DOCUMENTATION.md](./LEGAL_DOCUMENTATION.md) - Documentação legal
- [README.md](./README.md) - Este arquivo

**Testing (2 arquivos):**
- [FRONTEND_TESTING_GUIDE.md](./FRONTEND_TESTING_GUIDE.md) - Guia de testes frontend
- [GUIA_TESTE_VISUAL_CONTRASTE.md](./GUIA_TESTE_VISUAL_CONTRASTE.md) - Testes visuais

**Outros (6 arquivos):**
- [PRODUCT_ROADMAP_2026.md](./PRODUCT_ROADMAP_2026.md) - Roadmap 2026
- [PRODUCTION_DEPLOYMENT_CHECKLIST.md](./PRODUCTION_DEPLOYMENT_CHECKLIST.md) - Checklist de deployment
- [SOC2_GAP_ANALYSIS.md](./SOC2_GAP_ANALYSIS.md) - Análise SOC2
- [CLOUD_BROWSE_API.md](./CLOUD_BROWSE_API.md) - API Cloud Browse
- [INVARIANTS.md](./INVARIANTS.md) - Invariantes do sistema
- [curl-examples.md](./curl-examples.md) - Exemplos de curl

### 📁 [architecture/](./architecture/) - Arquitetura do Sistema
Documentação detalhada da arquitetura
- Guia completo de arquitetura
- Visão técnica detalhada
- Security architecture
- Evidence bundles
- External API

### 📁 [implementation/](./implementation/) - Implementação e Status
Status de implementação e features
- Features completas
- Frontend implementation
- HITL (Human-in-the-Loop)
- SDKs (Python)
- Sidecar hospital

### 📁 [planning/](./planning/) - Planejamento e Roadmap
Planejamento estratégico e roadmap
- Plano de execução Q1 2026
- Product roadmap EU AI Act
- MVP status
- Insurance adaptation

### 📁 [sales/](./sales/) - Vendas e Business
Material de vendas e análises de mercado
- Sales playbook
- Enterprise analysis
- User guides

### 📁 [security/](./security/) - Segurança e Compliance
Segurança, compliance e políticas
- Security policy
- Evidence of controls
- Auditor Q&A
- SLO (Service Level Objectives)

### 📁 [setup/](./setup/) - Setup e Configuração
Guias de instalação e configuração
- Xase setup guide
- Deployment guides
- KMS setup
- MinIO storage setup
- AI Agent setup

### 📁 [technical/](./technical/) - Documentação Técnica
Documentação técnica detalhada

---

## 🎯 O que é o Xase?

**Xase** é uma plataforma que combina:

### 🔐 XASE Core - Evidence Layer
Camada de evidência para decisões de IA que transforma cada decisão automatizada em um registro legal verificável e imutável.

**Principais features:**
- Registro imutável de decisões
- Hashes criptográficos e chain
- Evidence bundles verificáveis offline
- Storage MinIO/S3 com WORM
- API REST completa
- Compliance EU AI Act

### 🤖 AI Agent WhatsApp
Sistema de assistente virtual inteligente para WhatsApp usando OpenAI.

**Principais features:**
- Atendimento automatizado com GPT-3.5/4
- Múltiplas instâncias WhatsApp
- Base de conhecimento semântica
- Sistema de tokens e rate limiting
- Dashboard analytics

---

## 🚀 Quick Start

### Para Desenvolvedores
```bash
# 1. Instalar dependências
npm install

# 2. Setup database
npm run xase:setup
npx prisma db push

# 3. Criar tenant
npm run xase:tenant "Sua Empresa" "email@empresa.com" "Nome"

# 4. Iniciar desenvolvimento
npm run dev
```

📖 **Leia:** [Setup Guide](./setup/XASE_SETUP_GUIDE.md)

### Para AI Agent WhatsApp
```bash
# 1. Configure Evolution API e OpenAI no .env
OPENAI_API_KEY=sk-...
EVOLUTION_API_URL=https://...
EVOLUTION_API_KEY=...

# 2. Acesse o dashboard
http://localhost:3000/ai-agent
```

📖 **Leia:** [AI Agent README](./setup/AI_AGENT_README.md)

---

## 🔌 API Example

### Registrar Decisão de IA
```bash
POST /api/xase/v1/ingest
Content-Type: application/json
X-API-Key: xase_pk_...

{
  "input": { "user_id": "123", "amount": 5000 },
  "output": { "decision": "APPROVED" },
  "policy_id": "credit_policy_v1",
  "confidence": 0.95
}
```

### Baixar Evidência
```bash
GET /api/xase/v1/export/{transaction_id}/download?download=redirect
X-API-Key: xase_pk_...
```

📖 **Leia:** [Technical Overview](./architecture/XASE_TECHNICAL_OVERVIEW.md)

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
