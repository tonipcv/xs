# Xase Sheets - Documentação Completa do Sistema

## 📋 Índice

1. [Visão Geral do Sistema](#visão-geral-do-sistema)
2. [Proposta de Valor](#proposta-de-valor)
3. [Arquitetura Técnica](#arquitetura-técnica)
4. [Modelos de Dados](#modelos-de-dados)
5. [API Routes Completas](#api-routes-completas)
6. [Fluxos de Usuário](#fluxos-de-usuário)
7. [User Stories](#user-stories)
8. [Objeções e Soluções](#objeções-e-soluções)
9. [Features Futuras](#features-futuras)
10. [Guias de Implementação](#guias-de-implementação)

---

## 1. Visão Geral do Sistema

### O que é Xase Sheets?

**Xase Sheets** é uma plataforma de **Data Governance as a Service** que permite organizações treinar modelos de IA com dados sensíveis (PHI, PII, dados financeiros) mantendo conformidade total com regulamentações como GDPR, HIPAA, LGPD e SOC 2.

### Problema que Resolve

**Problema Principal:** Empresas de IA precisam de dados reais para treinar modelos, mas:
- Dados sensíveis não podem ser compartilhados diretamente (GDPR, HIPAA)
- Anonimização tradicional destrói utilidade dos dados
- Compliance é complexo e caro
- Auditoria e evidências são difíceis de manter

**Solução Xase:** Governança de dados em tempo de treinamento com:
- Processamento de dados no ambiente do cliente (on-premise ou cloud privada)
- Desidentificação em tempo real via Sidecar
- Auditoria automática e evidências criptográficas
- Marketplace de dados governados

### Componentes Principais

1. **Xase Brain (Backend)** - Plataforma central de governança
2. **Xase Sidecar** - Agente de processamento de dados (Rust)
3. **Xase Frontend** - Interface web (Next.js)
4. **Xase CLI** - Ferramenta de linha de comando (Python)
5. **Xase SDKs** - JavaScript e Python para integração

---

## 2. Proposta de Valor

### Para Data Suppliers (Hospitais, Bancos, Seguradoras)

**Valor:**
- ✅ Monetize dados sem compartilhar dados brutos
- ✅ Mantenha controle total sobre dados sensíveis
- ✅ Compliance automático (GDPR, HIPAA, LGPD)
- ✅ Auditoria completa de acesso
- ✅ Receita passiva via marketplace

**Como Funciona:**
1. Supplier cria política de governança (ex: "remover nomes de pacientes")
2. Supplier publica oferta no marketplace
3. Cliente treina modelo via Sidecar (dados nunca saem do ambiente)
4. Supplier recebe pagamento por uso
5. Evidências criptográficas são geradas automaticamente

### Para Data Consumers (Empresas de IA, Pesquisadores)

**Valor:**
- ✅ Acesso a dados reais de alta qualidade
- ✅ Sem preocupações com compliance
- ✅ Integração simples (SDK + Sidecar)
- ✅ Treinamento em seu próprio ambiente
- ✅ Evidências para auditorias

**Como Funciona:**
1. Consumer encontra dataset no marketplace
2. Aceita oferta de acesso governado
3. Instala Sidecar no pod de treinamento
4. Treina modelo normalmente (dados são processados em tempo real)
5. Recebe evidências de compliance

### Para Reguladores e Auditores

**Valor:**
- ✅ Auditoria completa de acesso a dados
- ✅ Evidências criptográficas imutáveis
- ✅ Rastreabilidade de PHI/PII
- ✅ Relatórios de compliance automáticos
- ✅ Verificação de políticas aplicadas

---

## 3. Arquitetura Técnica

### Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                     XASE BRAIN (Cloud)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Next.js    │  │  PostgreSQL  │  │  ClickHouse  │      │
│  │   Frontend   │  │   (Prisma)   │  │   (Audit)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                           │                                  │
│                    REST API + Auth                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS (Auth + Telemetry)
                            │
┌─────────────────────────────────────────────────────────────┐
│              CLIENT ENVIRONMENT (Hospital/Company)           │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Kubernetes Training Pod                │    │
│  │                                                      │    │
│  │  ┌──────────────┐         ┌──────────────┐        │    │
│  │  │   Training   │ Unix    │    Xase      │        │    │
│  │  │   Process    │ Socket  │   Sidecar    │        │    │
│  │  │  (PyTorch)   │◄────────┤   (Rust)     │        │    │
│  │  └──────────────┘         └──────────────┘        │    │
│  │                                   │                 │    │
│  │                                   │                 │    │
│  └───────────────────────────────────┼─────────────────┘    │
│                                      │                       │
│                            ┌─────────▼─────────┐            │
│                            │   Data Source     │            │
│                            │  S3 / PACS / EHR  │            │
│                            └───────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

1. **Training Process** solicita segmento via Unix socket
2. **Sidecar** verifica cache local
3. Se cache miss: **Sidecar** baixa de S3/PACS/FHIR
4. **Sidecar** aplica pipeline de governança (desidentificação, watermark)
5. **Sidecar** retorna dados processados via Unix socket
6. **Sidecar** envia telemetria para Brain (métricas, não dados)
7. **Brain** gera evidências criptográficas

### Stack Tecnológico

**Backend (Xase Brain):**
- Next.js 14 (App Router)
- TypeScript
- Prisma ORM (PostgreSQL)
- NextAuth.js (autenticação)
- ClickHouse (audit logs)
- Zod (validação)

**Sidecar:**
- Rust (performance crítica)
- Tokio (async runtime)
- AWS SDK (S3)
- Reqwest (HTTP para PACS/FHIR)
- Prometheus (métricas)

**Frontend:**
- React 18
- TailwindCSS
- shadcn/ui
- Recharts (gráficos)
- Lucide Icons

**Infraestrutura:**
- Kubernetes (deployment)
- Helm (package manager)
- Docker (containers)
- Terraform (IaC)

---

## 4. Modelos de Dados

### Modelo Conceitual

```
User ──┬─► Tenant ──┬─► Dataset ──┬─► DataSource
       │            │              └─► AccessPolicy
       │            ├─► AccessOffer
       │            ├─► PolicyExecution
       │            ├─► CreditLedger
       │            └─► CloudIntegration
       │
       └─► Session
           Account
```

### Entidades Principais

#### User (Usuário)
```typescript
{
  id: string
  email: string
  name: string
  tenantId: string
  xaseRole: "OWNER" | "ADMIN" | "VIEWER"
  twoFactorEnabled: boolean
  createdAt: DateTime
}
```

**Propósito:** Representa usuários do sistema com autenticação e autorização.

#### Tenant (Organização)
```typescript
{
  id: string
  name: string
  email: string
  organizationType: "SUPPLIER" | "CLIENT" | "PLATFORM_ADMIN"
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED"
  plan: string // "free", "pro", "enterprise"
  createdAt: DateTime
}
```

**Propósito:** Multi-tenancy - cada organização é isolada.

#### Dataset (Conjunto de Dados)
```typescript
{
  id: string
  tenantId: string
  name: string
  description: string
  dataType: "AUDIO" | "DICOM" | "FHIR" | "TEXT" | "TIMESERIES"
  status: "DRAFT" | "ACTIVE" | "ARCHIVED"
  totalSize: bigint
  recordCount: bigint
  createdAt: DateTime
}
```

**Propósito:** Representa um conjunto de dados governado.

#### DataSource (Fonte de Dados)
```typescript
{
  id: string
  datasetId: string
  sourceType: "S3" | "GCS" | "AZURE_BLOB" | "PACS" | "FHIR"
  location: string // URI ou path
  credentials: string // encrypted
  status: "ACTIVE" | "ERROR" | "DISABLED"
}
```

**Propósito:** Configuração de onde os dados estão armazenados.

#### AccessPolicy (Política de Governança)
```typescript
{
  id: string
  tenantId: string
  datasetId: string
  name: string
  rules: Json // Regras de desidentificação
  epsilonBudget: Decimal // Privacy budget (DP)
  watermarkEnabled: boolean
  status: "DRAFT" | "ACTIVE" | "ARCHIVED"
}
```

**Propósito:** Define como dados devem ser processados.

#### AccessOffer (Oferta de Acesso)
```typescript
{
  id: string
  supplierTenantId: string
  datasetId: string
  policyId: string
  title: string
  description: string
  pricePerGb: Decimal
  pricePerHour: Decimal
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  visibility: "PUBLIC" | "PRIVATE"
}
```

**Propósito:** Oferta no marketplace de dados governados.

#### PolicyExecution (Execução de Política)
```typescript
{
  id: string
  offerId: string
  buyerTenantId: string
  leaseId: string
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED"
  bytesProcessed: bigint
  redactionsApplied: bigint
  startedAt: DateTime
  completedAt: DateTime
}
```

**Propósito:** Rastreia uso de dados governados.

#### AuditLog (Log de Auditoria)
```typescript
{
  id: string
  tenantId: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  metadata: Json
  ipAddress: string
  timestamp: DateTime
}
```

**Propósito:** Auditoria completa de ações no sistema (ClickHouse).

#### EvidenceBundle (Evidência Criptográfica)
```typescript
{
  id: string
  executionId: string
  evidenceType: "POLICY_APPLIED" | "DATA_ACCESSED" | "REDACTION_PROOF"
  merkleRoot: string
  signature: string
  metadata: Json
  createdAt: DateTime
}
```

**Propósito:** Provas criptográficas para auditoria.

---

## 5. API Routes Completas

### Autenticação e Usuários

#### POST `/api/auth/register`
**Descrição:** Registra novo usuário e tenant  
**Body:**
```json
{
  "email": "user@company.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "companyName": "Acme Corp",
  "organizationType": "CLIENT"
}
```
**Response:** `201 Created`

#### POST `/api/auth/login`
**Descrição:** Autentica usuário  
**Body:**
```json
{
  "email": "user@company.com",
  "password": "SecurePass123!"
}
```
**Response:** Session token

#### POST `/api/auth/logout`
**Descrição:** Encerra sessão  
**Response:** `200 OK`

#### GET `/api/auth/session`
**Descrição:** Retorna sessão atual  
**Response:**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@company.com",
    "tenantId": "tenant_456"
  }
}
```

### Datasets

#### GET `/api/v1/datasets`
**Descrição:** Lista datasets do tenant  
**Query Params:**
- `page`: número da página
- `limit`: itens por página
- `status`: filtro por status

**Response:**
```json
{
  "datasets": [
    {
      "id": "ds_123",
      "name": "Medical Records 2024",
      "dataType": "FHIR",
      "status": "ACTIVE",
      "recordCount": 50000,
      "totalSize": 10737418240
    }
  ],
  "total": 1,
  "page": 1
}
```

#### POST `/api/v1/datasets`
**Descrição:** Cria novo dataset  
**Body:**
```json
{
  "name": "Medical Records 2024",
  "description": "Patient records for AI training",
  "dataType": "FHIR",
  "tags": ["healthcare", "ehr"]
}
```
**Response:** `201 Created`

#### GET `/api/v1/datasets/[datasetId]`
**Descrição:** Detalhes de um dataset  
**Response:**
```json
{
  "id": "ds_123",
  "name": "Medical Records 2024",
  "description": "Patient records for AI training",
  "dataType": "FHIR",
  "status": "ACTIVE",
  "sources": [...],
  "policies": [...],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### PUT `/api/v1/datasets/[datasetId]`
**Descrição:** Atualiza dataset  
**Body:** Campos a atualizar  
**Response:** `200 OK`

#### DELETE `/api/v1/datasets/[datasetId]`
**Descrição:** Arquiva dataset  
**Response:** `204 No Content`

### Data Sources

#### POST `/api/v1/datasets/[datasetId]/sources`
**Descrição:** Adiciona fonte de dados ao dataset  
**Body:**
```json
{
  "sourceType": "S3",
  "location": "s3://my-bucket/medical-records/",
  "credentials": {
    "accessKeyId": "AKIA...",
    "secretAccessKey": "..."
  }
}
```
**Response:** `201 Created`

#### GET `/api/v1/datasets/[datasetId]/sources`
**Descrição:** Lista fontes de dados  
**Response:** Array de sources

#### DELETE `/api/v1/datasets/[datasetId]/sources/[sourceId]`
**Descrição:** Remove fonte de dados  
**Response:** `204 No Content`

### Políticas de Governança

#### GET `/api/v1/policies`
**Descrição:** Lista políticas do tenant  
**Response:**
```json
{
  "policies": [
    {
      "id": "pol_123",
      "name": "HIPAA Compliant - Remove PHI",
      "datasetId": "ds_123",
      "status": "ACTIVE",
      "rules": {...}
    }
  ]
}
```

#### POST `/api/v1/policies`
**Descrição:** Cria nova política  
**Body:**
```json
{
  "name": "HIPAA Compliant - Remove PHI",
  "datasetId": "ds_123",
  "rules": {
    "dicom": {
      "stripTags": ["PatientName", "PatientID", "PatientBirthDate"]
    },
    "fhir": {
      "redactPaths": ["$.patient.name", "$.patient.identifier"]
    }
  },
  "watermarkEnabled": true,
  "epsilonBudget": 1.0
}
```
**Response:** `201 Created`

#### GET `/api/v1/policies/[policyId]`
**Descrição:** Detalhes de uma política  
**Response:** Objeto da política

#### PUT `/api/v1/policies/[policyId]`
**Descrição:** Atualiza política  
**Response:** `200 OK`

#### POST `/api/v1/policies/[policyId]/validate`
**Descrição:** Valida política contra amostra de dados  
**Body:**
```json
{
  "sampleData": "base64_encoded_data"
}
```
**Response:**
```json
{
  "valid": true,
  "redactionsApplied": 15,
  "preview": "..."
}
```

### Marketplace (Access Offers)

#### GET `/api/v1/access-offers`
**Descrição:** Lista ofertas públicas no marketplace  
**Query Params:**
- `dataType`: filtro por tipo
- `search`: busca por texto
- `minPrice`, `maxPrice`: filtro por preço

**Response:**
```json
{
  "offers": [
    {
      "id": "offer_123",
      "title": "UK Hospital Medical Images",
      "description": "10M DICOM images with PHI removed",
      "dataType": "DICOM",
      "pricePerGb": 0.50,
      "pricePerHour": 10.00,
      "supplierName": "NHS Trust",
      "rating": 4.8
    }
  ]
}
```

#### POST `/api/v1/access-offers`
**Descrição:** Cria oferta (supplier)  
**Body:**
```json
{
  "datasetId": "ds_123",
  "policyId": "pol_123",
  "title": "UK Hospital Medical Images",
  "description": "10M DICOM images with PHI removed",
  "pricePerGb": 0.50,
  "pricePerHour": 10.00,
  "visibility": "PUBLIC"
}
```
**Response:** `201 Created`

#### GET `/api/v1/access-offers/[offerId]`
**Descrição:** Detalhes de uma oferta  
**Response:** Objeto da oferta com detalhes completos

#### POST `/api/v1/access-offers/[offerId]/accept`
**Descrição:** Aceita oferta e cria lease (consumer)  
**Body:**
```json
{
  "duration": "7d",
  "estimatedGb": 100
}
```
**Response:**
```json
{
  "leaseId": "lease_123",
  "contractId": "ctr_456",
  "apiKey": "xase_pk_...",
  "sidecarConfig": {...}
}
```

### Leases (Contratos de Acesso)

#### GET `/api/v1/leases`
**Descrição:** Lista leases ativos  
**Response:**
```json
{
  "leases": [
    {
      "id": "lease_123",
      "offerId": "offer_123",
      "status": "ACTIVE",
      "startedAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2024-01-08T00:00:00Z",
      "bytesProcessed": 10737418240,
      "costAccrued": 150.00
    }
  ]
}
```

#### GET `/api/v1/leases/[leaseId]`
**Descrição:** Detalhes de um lease  
**Response:** Objeto do lease

#### POST `/api/v1/leases/[leaseId]/renew`
**Descrição:** Renova lease  
**Body:**
```json
{
  "duration": "7d"
}
```
**Response:** `200 OK`

#### DELETE `/api/v1/leases/[leaseId]`
**Descrição:** Cancela lease  
**Response:** `204 No Content`

### Sidecar Integration

#### POST `/api/v1/sidecar/telemetry`
**Descrição:** Recebe telemetria do Sidecar  
**Headers:** `X-Xase-Session-Id`, `X-Xase-API-Key`  
**Body:**
```json
{
  "sessionId": "sess_123",
  "metrics": {
    "bytesProcessed": 1073741824,
    "segmentsServed": 1000,
    "cacheHitRate": 0.85,
    "redactionsApplied": 150
  }
}
```
**Response:** `200 OK`

#### POST `/api/v1/sidecar/kill-switch`
**Descrição:** Verifica se Sidecar deve ser desligado  
**Headers:** `X-Xase-Session-Id`  
**Response:**
```json
{
  "shouldKill": false,
  "reason": null
}
```

#### POST `/api/v1/sidecar/sessions`
**Descrição:** Cria nova sessão de Sidecar (autenticação)  
**Body:**
```json
{
  "contractId": "ctr_123",
  "apiKey": "xase_pk_...",
  "leaseId": "lease_123"
}
```
**Response:**
```json
{
  "sessionId": "sess_123",
  "stsToken": "...",
  "expiresAt": "2024-01-01T01:00:00Z",
  "config": {
    "bucketName": "...",
    "bucketPrefix": "...",
    "policyRules": {...}
  }
}
```

### Auditoria

#### GET `/api/v1/audit/query`
**Descrição:** Consulta logs de auditoria  
**Query Params:**
- `startDate`, `endDate`: período
- `action`: filtro por ação
- `userId`: filtro por usuário
- `resourceType`: filtro por tipo de recurso

**Response:**
```json
{
  "logs": [
    {
      "id": "log_123",
      "timestamp": "2024-01-01T12:00:00Z",
      "userId": "user_123",
      "action": "dataset.access",
      "resourceType": "Dataset",
      "resourceId": "ds_123",
      "ipAddress": "192.168.1.1",
      "metadata": {...}
    }
  ],
  "total": 1000
}
```

#### GET `/api/v1/audit/export`
**Descrição:** Exporta logs de auditoria (CSV)  
**Query Params:** Mesmos de `/audit/query`  
**Response:** CSV file download

### Evidências

#### GET `/api/v1/evidence/generate`
**Descrição:** Gera bundle de evidências para execução  
**Query Params:**
- `executionId`: ID da execução

**Response:**
```json
{
  "bundleId": "bundle_123",
  "executionId": "exec_123",
  "merkleRoot": "0x1234...",
  "signature": "0x5678...",
  "evidences": [
    {
      "type": "POLICY_APPLIED",
      "timestamp": "2024-01-01T12:00:00Z",
      "proof": "..."
    }
  ],
  "downloadUrl": "/api/v1/evidence/download/bundle_123"
}
```

### Billing e Usage

#### GET `/api/v1/billing/usage`
**Descrição:** Uso e custos do tenant  
**Query Params:**
- `startDate`, `endDate`: período

**Response:**
```json
{
  "period": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "usage": {
    "bytesProcessed": 1099511627776,
    "computeHours": 240,
    "storageGbHours": 10000
  },
  "costs": {
    "dataProcessing": 500.00,
    "compute": 2400.00,
    "storage": 100.00,
    "total": 3000.00
  }
}
```

#### GET `/api/v1/billing/invoices`
**Descrição:** Lista faturas  
**Response:** Array de invoices

### Cloud Integrations

#### GET `/api/cloud-integrations`
**Descrição:** Lista integrações cloud do tenant  
**Response:**
```json
{
  "integrations": [
    {
      "id": "int_123",
      "provider": "AWS_S3",
      "name": "Production S3",
      "status": "ACTIVE",
      "lastSyncAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### POST `/api/cloud-integrations`
**Descrição:** Adiciona integração cloud  
**Body:**
```json
{
  "provider": "AWS_S3",
  "name": "Production S3",
  "credentials": {
    "accessKeyId": "AKIA...",
    "secretAccessKey": "...",
    "region": "us-east-1"
  }
}
```
**Response:** `201 Created`

#### POST `/api/cloud-integrations/[id]/scan`
**Descrição:** Escaneia buckets/containers  
**Response:**
```json
{
  "buckets": [
    {
      "name": "my-medical-data",
      "region": "us-east-1",
      "objectCount": 50000,
      "totalSize": 1099511627776
    }
  ]
}
```

### Health e Monitoring

#### GET `/api/health`
**Descrição:** Health check básico  
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### GET `/api/v1/health/detailed`
**Descrição:** Health check detalhado  
**Response:**
```json
{
  "status": "healthy",
  "services": {
    "database": "healthy",
    "clickhouse": "healthy",
    "redis": "healthy"
  },
  "version": "2.0.0"
}
```

#### GET `/api/metrics`
**Descrição:** Métricas Prometheus  
**Response:** Prometheus format

---

## 6. Fluxos de Usuário

### Fluxo 1: Supplier Publica Dados

```
1. Supplier faz login
2. Navega para "Datasets" → "New Dataset"
3. Preenche informações:
   - Nome: "UK Hospital Medical Images"
   - Tipo: DICOM
   - Descrição
4. Adiciona fonte de dados (S3/PACS)
5. Cria política de governança:
   - Remove: PatientName, PatientID, InstitutionName
   - Habilita watermark
6. Testa política com amostra
7. Cria oferta no marketplace:
   - Preço: $0.50/GB, $10/hora
   - Visibilidade: Pública
8. Publica oferta
```

### Fluxo 2: Consumer Treina Modelo

```
1. Consumer faz login
2. Navega para "Marketplace"
3. Busca por "medical images"
4. Seleciona oferta "UK Hospital Medical Images"
5. Revisa política de governança
6. Aceita oferta:
   - Duração: 7 dias
   - Estimativa: 100GB
7. Recebe credenciais:
   - API Key
   - Contract ID
   - Lease ID
8. Instala Sidecar no Kubernetes:
   ```bash
   helm install xase-sidecar ./k8s/sidecar \
     --set contract.id=ctr_123 \
     --set contract.apiKey=xase_pk_... \
     --set contract.leaseId=lease_123
   ```
9. Configura training script:
   ```python
   from xase import SidecarDataLoader
   
   loader = SidecarDataLoader(socket_path="/var/run/xase/sidecar.sock")
   for batch in loader:
       model.train(batch)
   ```
10. Inicia treinamento
11. Sidecar processa dados em tempo real
12. Ao final, baixa evidências de compliance
```

### Fluxo 3: Auditoria de Compliance

```
1. Auditor faz login (ou acessa via API)
2. Navega para "Audit Logs"
3. Filtra por:
   - Dataset: "UK Hospital Medical Images"
   - Período: Último mês
   - Ação: "data.access"
4. Visualiza logs:
   - Quem acessou
   - Quando acessou
   - Quantos bytes processados
   - Quais redações foram aplicadas
5. Exporta relatório (CSV/PDF)
6. Baixa evidências criptográficas
7. Verifica assinaturas Merkle
```

### Fluxo 4: Renovação de Lease

```
1. Consumer recebe notificação: "Lease expira em 24h"
2. Navega para "Leases"
3. Seleciona lease ativo
4. Clica "Renew"
5. Seleciona duração: 7 dias
6. Confirma pagamento
7. Lease é renovado automaticamente
8. Treinamento continua sem interrupção
```

---

## 7. User Stories

### Supplier (Hospital)

**Como** administrador de dados de um hospital  
**Quero** monetizar nossos dados médicos sem compartilhar PHI  
**Para** gerar receita mantendo conformidade com HIPAA

**Critérios de Aceitação:**
- ✅ Posso criar dataset apontando para nosso PACS
- ✅ Posso definir política que remove todos os identificadores HIPAA
- ✅ Posso testar política antes de publicar
- ✅ Posso publicar oferta no marketplace
- ✅ Recebo pagamento por GB processado
- ✅ Tenho auditoria completa de quem acessou

**Como** DPO (Data Protection Officer)  
**Quero** evidências de que PHI foi removido  
**Para** demonstrar conformidade em auditorias

**Critérios de Aceitação:**
- ✅ Tenho logs de todas as redações aplicadas
- ✅ Tenho evidências criptográficas imutáveis
- ✅ Posso exportar relatórios de compliance
- ✅ Posso verificar assinaturas Merkle

### Consumer (Empresa de IA)

**Como** engenheiro de ML  
**Quero** treinar modelo com dados médicos reais  
**Para** melhorar acurácia sem me preocupar com HIPAA

**Critérios de Aceitação:**
- ✅ Posso encontrar datasets no marketplace
- ✅ Posso ver política de governança antes de aceitar
- ✅ Integração é simples (SDK + Sidecar)
- ✅ Treinamento funciona normalmente
- ✅ Recebo evidências de compliance ao final

**Como** CTO de startup de IA  
**Quero** acesso rápido a dados governados  
**Para** acelerar desenvolvimento de produtos

**Critérios de Aceitação:**
- ✅ Posso aceitar oferta em minutos
- ✅ Não preciso negociar contratos complexos
- ✅ Pago apenas pelo que uso
- ✅ Posso cancelar a qualquer momento

### Platform Admin

**Como** administrador da plataforma Xase  
**Quero** monitorar saúde do sistema  
**Para** garantir SLA de 99.9%

**Critérios de Aceitação:**
- ✅ Tenho dashboard de métricas em tempo real
- ✅ Recebo alertas de problemas
- ✅ Posso ver uso por tenant
- ✅ Posso desativar tenants problemáticos

### Auditor Externo

**Como** auditor de compliance  
**Quero** verificar que políticas foram aplicadas corretamente  
**Para** certificar conformidade regulatória

**Critérios de Aceitação:**
- ✅ Posso acessar logs de auditoria via API
- ✅ Posso verificar evidências criptográficas
- ✅ Posso validar assinaturas Merkle
- ✅ Posso exportar relatórios para reguladores

---

## 8. Objeções e Soluções

### Objeção 1: "Dados nunca saem do nosso ambiente?"

**Resposta:**  
Correto. O Sidecar roda **dentro do seu Kubernetes cluster**, no mesmo pod que o treinamento. Dados são processados localmente e nunca saem do seu ambiente. Apenas telemetria (métricas, não dados) é enviada para o Xase Brain.

**Prova Técnica:**
- Sidecar usa Unix socket (comunicação local)
- Dados são lidos de S3/PACS local
- Processamento acontece em memória
- Apenas métricas agregadas são enviadas (bytes processados, cache hit rate)

### Objeção 2: "Como garantem que PHI foi realmente removido?"

**Resposta:**  
Múltiplas camadas de garantia:

1. **Política Testável:** Teste com amostra antes de publicar
2. **Auditoria:** Cada redação é logada
3. **Evidências Criptográficas:** Merkle tree com assinaturas
4. **Watermarking:** Detecta vazamento de dados
5. **Código Aberto:** Sidecar é open source (auditável)

### Objeção 3: "E se o Xase Brain cair?"

**Resposta:**  
**Cache-Only Mode** - Treinamento continua normalmente:

1. Sidecar tem grace period de 5 minutos
2. Se Brain não responde, entra em modo cache-only
3. Treinamento usa dados já em cache
4. Quando Brain volta, sincroniza automaticamente
5. GPU de $5k/hora não para

### Objeção 4: "Preço é muito alto"

**Resposta:**  
Comparação de custos:

**Sem Xase:**
- Advogado para contratos: $10k-50k
- DPO para compliance: $100k/ano
- Infraestrutura de governança: $50k-200k
- Risco de multa GDPR: até €20M

**Com Xase:**
- $0.50/GB processado
- $10/hora de treinamento
- Compliance automático
- Zero risco regulatório

**ROI:** Positivo após primeiro projeto

### Objeção 5: "Já temos solução de anonimização"

**Resposta:**  
Anonimização tradicional tem problemas:

**Problema 1:** Destrói utilidade dos dados  
**Solução Xase:** Desidentificação em tempo real preserva utilidade

**Problema 2:** Irreversível (não pode ajustar)  
**Solução Xase:** Política é configurável e testável

**Problema 3:** Sem auditoria  
**Solução Xase:** Auditoria completa + evidências

**Problema 4:** Não escala  
**Solução Xase:** Processamento paralelo no Sidecar

### Objeção 6: "Como sei que vocês não vão ver meus dados?"

**Resposta:**  
**Zero Knowledge Architecture:**

1. Dados nunca passam pelo Xase Brain
2. Sidecar é open source (auditável)
3. Processamento é local (seu ambiente)
4. Telemetria é agregada (sem dados brutos)
5. Evidências são criptográficas (verificáveis)

**Prova:** Rode Sidecar em air-gapped environment (sem internet) - funciona perfeitamente com cache-only mode.

### Objeção 7: "E se quisermos usar nosso próprio PACS?"

**Resposta:**  
**Suportado!** Sidecar tem 4 modos:

1. **S3 Mode:** AWS S3 (padrão)
2. **DICOMweb Mode:** Seu PACS local
3. **FHIR Mode:** Seu EHR local
4. **Hybrid Mode:** PACS primário + S3 fallback

Configuração simples via Helm:
```bash
--set sidecar.ingestion.mode=dicomweb \
--set sidecar.ingestion.dicomweb.url=http://pacs.hospital.local:8080
```

### Objeção 8: "Tokens expiram durante treinamento longo"

**Resposta:**  
**Resolvido!** TokenRefresher automático:

- Tokens são renovados em 80% do lifetime
- Treinamentos de 2+ semanas funcionam perfeitamente
- Retry exponencial se renovação falhar
- Zero interrupção

### Objeção 9: "Como monitoro performance?"

**Resposta:**  
**Prometheus + Grafana:**

- Endpoint `/metrics` em cada Sidecar
- 12 métricas principais (cache hit rate, latency, etc.)
- Integra com Grafana existente
- Alertas configuráveis

### Objeção 10: "E se precisarmos de features customizadas?"

**Resposta:**  
**Extensível:**

1. **Custom Pipelines:** Adicione seu próprio pipeline de processamento
2. **Custom Providers:** Integre com qualquer data source
3. **Webhooks:** Receba eventos em tempo real
4. **API Completa:** Automatize tudo via API
5. **Enterprise Support:** Desenvolvimento customizado disponível

---

## 9. Features Futuras

### Q2 2026

#### 1. Federated Learning Integration
**Descrição:** Treinar modelos sem mover dados entre organizações

**Funcionalidades:**
- Agregação segura de gradientes
- Differential privacy em gradientes
- Detecção de poisoning attacks
- Suporte para PyTorch e TensorFlow

**Valor:** Hospitais podem colaborar em modelos sem compartilhar dados

#### 2. Real-Time Data Streaming
**Descrição:** Stream de dados em tempo real para treinamento online

**Funcionalidades:**
- Kafka/Kinesis integration
- Stream processing com governança
- Windowing e aggregation
- Backpressure handling

**Valor:** Modelos podem ser atualizados continuamente

#### 3. Advanced Watermarking
**Descrição:** Watermarking mais sofisticado para detecção de vazamento

**Funcionalidades:**
- Watermark em embeddings
- Detecção estatística
- Rastreamento de origem
- Prova criptográfica de vazamento

**Valor:** Proteção contra roubo de dados

### Q3 2026

#### 4. Synthetic Data Generation
**Descrição:** Gerar dados sintéticos que preservam distribuição

**Funcionalidades:**
- GANs para geração
- Differential privacy garantido
- Validação estatística
- Mixing com dados reais

**Valor:** Aumentar volume de dados mantendo privacidade

#### 5. Multi-Cloud Support
**Descrição:** Suporte nativo para AWS, GCP, Azure

**Funcionalidades:**
- Sidecar otimizado para cada cloud
- Cross-cloud data access
- Unified billing
- Cloud-agnostic APIs

**Valor:** Flexibilidade de deployment

#### 6. Blockchain Evidence
**Descrição:** Evidências em blockchain público

**Funcionalidades:**
- Merkle roots em Ethereum/Polygon
- Smart contracts para verificação
- Timestamping imutável
- NFTs de compliance

**Valor:** Prova irrefutável para reguladores

### Q4 2026

#### 7. AI-Powered Policy Suggestions
**Descrição:** IA sugere políticas de governança

**Funcionalidades:**
- Análise de schema de dados
- Detecção automática de PII/PHI
- Sugestão de redações
- Compliance scoring

**Valor:** Reduz tempo de configuração

#### 8. Collaborative Governance
**Descrição:** Múltiplas organizações governam dados juntas

**Funcionalidades:**
- Multi-party computation
- Shared policy management
- Distributed audit logs
- Consensus mechanisms

**Valor:** Consórcios podem compartilhar dados

#### 9. Edge Computing Support
**Descrição:** Sidecar em dispositivos edge

**Funcionalidades:**
- ARM support
- Reduced memory footprint
- Offline-first mode
- Edge-to-cloud sync

**Valor:** IoT e mobile use cases

### 2027 e Além

#### 10. Homomorphic Encryption
**Descrição:** Computação em dados criptografados

**Funcionalidades:**
- FHE para operações básicas
- Hybrid approach (FHE + TEE)
- Performance optimization
- Library integration

**Valor:** Privacidade máxima

#### 11. Quantum-Resistant Cryptography
**Descrição:** Preparação para computadores quânticos

**Funcionalidades:**
- Post-quantum signatures
- Lattice-based encryption
- Migration path
- Backward compatibility

**Valor:** Future-proof security

#### 12. Regulatory Compliance Automation
**Descrição:** Compliance automático com múltiplas regulamentações

**Funcionalidades:**
- GDPR auto-compliance
- HIPAA auto-compliance
- LGPD, CCPA, etc.
- Regulatory change detection
- Auto-update policies

**Valor:** Zero esforço de compliance

#### 13. Data Marketplace 2.0
**Descrição:** Marketplace avançado com leilões e contratos inteligentes

**Funcionalidades:**
- Dutch auctions
- Reverse auctions
- Smart contracts
- Escrow automático
- Reputation system

**Valor:** Descoberta de preço eficiente

#### 14. Privacy-Preserving Analytics
**Descrição:** Analytics em dados governados

**Funcionalidades:**
- Differential privacy queries
- Secure aggregation
- Privacy budget management
- SQL interface

**Valor:** Insights sem expor dados

#### 15. Automated Evidence Generation
**Descrição:** Evidências geradas automaticamente para auditorias

**Funcionalidades:**
- Continuous compliance monitoring
- Auto-generated reports
- Regulatory templates
- One-click audit packages

**Valor:** Auditorias em minutos, não semanas

---

## 10. Guias de Implementação

### Guia 1: Setup Inicial (Supplier)

**Pré-requisitos:**
- Conta Xase criada
- Dados em S3/PACS/FHIR
- Conhecimento básico de políticas de privacidade

**Passos:**

1. **Criar Dataset**
```bash
curl -X POST https://xase.ai/api/v1/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Medical Records 2024",
    "dataType": "FHIR",
    "description": "Patient records for AI training"
  }'
```

2. **Adicionar Data Source**
```bash
curl -X POST https://xase.ai/api/v1/datasets/$DATASET_ID/sources \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "sourceType": "S3",
    "location": "s3://my-bucket/medical-records/",
    "credentials": {...}
  }'
```

3. **Criar Política**
```bash
curl -X POST https://xase.ai/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "HIPAA Compliant",
    "datasetId": "$DATASET_ID",
    "rules": {
      "fhir": {
        "redactPaths": ["$.patient.name", "$.patient.identifier"]
      }
    }
  }'
```

4. **Testar Política**
```bash
curl -X POST https://xase.ai/api/v1/policies/$POLICY_ID/validate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "sampleData": "base64_encoded_fhir_resource"
  }'
```

5. **Publicar Oferta**
```bash
curl -X POST https://xase.ai/api/v1/access-offers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "datasetId": "$DATASET_ID",
    "policyId": "$POLICY_ID",
    "title": "UK Hospital Medical Records",
    "pricePerGb": 0.50,
    "visibility": "PUBLIC"
  }'
```

### Guia 2: Treinamento com Sidecar (Consumer)

**Pré-requisitos:**
- Kubernetes cluster
- Helm 3+
- Oferta aceita (lease ativo)

**Passos:**

1. **Instalar Sidecar**
```bash
helm repo add xase https://charts.xase.ai
helm install xase-sidecar xase/sidecar \
  --set contract.id=$CONTRACT_ID \
  --set contract.apiKey=$API_KEY \
  --set contract.leaseId=$LEASE_ID \
  --set sidecar.storage.bucketName=$BUCKET
```

2. **Criar Training Pod**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: training-pod
spec:
  containers:
  - name: training
    image: pytorch/pytorch:2.0
    volumeMounts:
    - name: xase-socket
      mountPath: /var/run/xase
  - name: sidecar
    image: xase/sidecar:latest
    env:
    - name: CONTRACT_ID
      value: $CONTRACT_ID
    volumeMounts:
    - name: xase-socket
      mountPath: /var/run/xase
  volumes:
  - name: xase-socket
    emptyDir: {}
```

3. **Training Script**
```python
from xase import SidecarDataLoader

loader = SidecarDataLoader(
    socket_path="/var/run/xase/sidecar.sock",
    batch_size=32
)

for epoch in range(10):
    for batch in loader:
        # Dados já processados e governados
        outputs = model(batch)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
```

4. **Monitorar Progresso**
```bash
# Via Prometheus
curl http://sidecar-pod:9090/metrics

# Via API
curl https://xase.ai/api/v1/leases/$LEASE_ID \
  -H "Authorization: Bearer $TOKEN"
```

5. **Baixar Evidências**
```bash
curl https://xase.ai/api/v1/evidence/generate?executionId=$EXEC_ID \
  -H "Authorization: Bearer $TOKEN" \
  -o evidence-bundle.zip
```

### Guia 3: Auditoria e Compliance

**Pré-requisitos:**
- Acesso de auditor
- Execution ID ou Dataset ID

**Passos:**

1. **Consultar Audit Logs**
```bash
curl "https://xase.ai/api/v1/audit/query?startDate=2024-01-01&endDate=2024-01-31&resourceType=Dataset" \
  -H "Authorization: Bearer $TOKEN"
```

2. **Exportar Relatório**
```bash
curl "https://xase.ai/api/v1/audit/export?format=csv&startDate=2024-01-01" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit-report.csv
```

3. **Verificar Evidências**
```bash
# Baixar bundle
curl https://xase.ai/api/v1/evidence/download/$BUNDLE_ID \
  -o evidence.zip

# Verificar assinatura Merkle
xase-cli verify-evidence evidence.zip
```

4. **Gerar Relatório de Compliance**
```bash
xase-cli generate-compliance-report \
  --execution-id $EXEC_ID \
  --regulation HIPAA \
  --output hipaa-compliance-report.pdf
```

---

## Conclusão

Este documento fornece uma visão completa do sistema Xase Sheets, cobrindo:

✅ **Proposta de Valor** - O que resolve e para quem  
✅ **Arquitetura Técnica** - Como funciona internamente  
✅ **Modelos de Dados** - Estrutura do banco de dados  
✅ **API Completa** - Todas as rotas documentadas  
✅ **Fluxos de Usuário** - Como usuários interagem  
✅ **User Stories** - Necessidades de cada perfil  
✅ **Objeções e Soluções** - Respostas para dúvidas comuns  
✅ **Features Futuras** - Roadmap de desenvolvimento  
✅ **Guias de Implementação** - Como usar na prática

Para documentação adicional, consulte:
- `/docs/implementation/` - Detalhes técnicos
- `/docs/sales/` - Material de vendas
- `/docs/architecture/` - Diagramas de arquitetura
- API Reference: https://docs.xase.ai

---

**Versão:** 2.0.0  
**Data:** 19 de Fevereiro de 2026  
**Autor:** Equipe Xase Engineering
