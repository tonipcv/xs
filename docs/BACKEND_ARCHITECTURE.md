# Backend Architecture - Xase Sheets

## Stack Tecnológico

- **Runtime:** Node.js 20+
- **Framework:** Next.js 14 (API Routes)
- **Linguagem:** TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL 15
- **Audit DB:** ClickHouse
- **Cache:** Redis (opcional)
- **Auth:** NextAuth.js
- **Validation:** Zod
- **Queue:** BullMQ (opcional)

## Estrutura de Diretórios

```
src/
├── app/api/                    # API Routes
│   ├── auth/                   # Autenticação
│   ├── v1/                     # API v1
│   │   ├── datasets/
│   │   ├── policies/
│   │   ├── access-offers/
│   │   ├── leases/
│   │   ├── audit/
│   │   ├── evidence/
│   │   ├── billing/
│   │   ├── sidecar/
│   │   └── webhooks/
│   ├── cloud-integrations/
│   ├── oauth/
│   └── metrics/
├── lib/                        # Bibliotecas core
│   ├── prisma.ts              # Prisma client
│   ├── clickhouse.ts          # ClickHouse client
│   ├── auth.ts                # NextAuth config
│   ├── crypto.ts              # Criptografia
│   ├── merkle.ts              # Merkle trees
│   └── validations/           # Schemas Zod
├── services/                   # Business logic
│   ├── dataset.service.ts
│   ├── policy.service.ts
│   ├── execution.service.ts
│   ├── billing.service.ts
│   ├── audit.service.ts
│   └── evidence.service.ts
├── middleware/                 # Middlewares
│   ├── auth.middleware.ts
│   ├── rate-limit.middleware.ts
│   └── tenant.middleware.ts
└── types/                      # TypeScript types
    ├── api.types.ts
    ├── prisma.types.ts
    └── domain.types.ts
```

## Modelos de Dados (Prisma)

### Core Models

#### User
```prisma
model User {
  id                   String    @id @default(cuid())
  email                String    @unique
  name                 String?
  password             String?
  tenantId             String?
  xaseRole             XaseRole?
  twoFactorEnabled     Boolean   @default(false)
  totpSecret           String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  
  accounts             Account[]
  sessions             Session[]
  tenant               Tenant?   @relation(fields: [tenantId], references: [id])
  
  @@index([tenantId])
  @@map("users")
}
```

#### Tenant
```prisma
model Tenant {
  id                   String              @id @default(cuid())
  name                 String
  email                String              @unique
  organizationType     OrganizationType?
  status               TenantStatus        @default(ACTIVE)
  plan                 String              @default("free")
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  
  users                User[]
  apiKeys              ApiKey[]
  datasets             Dataset[]
  clientPolicies       AccessPolicy[]      @relation("ClientPolicies")
  supplierOffers       AccessOffer[]       @relation("SupplierOffers")
  buyerExecutions      PolicyExecution[]   @relation("BuyerExecutions")
  creditLedger         CreditLedger[]
  cloudIntegrations    CloudIntegration[]
  
  @@map("xase_tenants")
}
```

#### Dataset
```prisma
model Dataset {
  id                String          @id @default(cuid())
  tenantId          String
  name              String
  description       String?
  dataType          DataType
  status            DatasetStatus   @default(DRAFT)
  totalSize         BigInt          @default(0)
  recordCount       BigInt          @default(0)
  tags              String[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  
  tenant            Tenant          @relation(fields: [tenantId], references: [id])
  sources           DataSource[]
  policies          AccessPolicy[]
  offers            AccessOffer[]
  
  @@index([tenantId])
  @@index([status])
  @@map("datasets")
}
```

#### DataSource
```prisma
model DataSource {
  id                String          @id @default(cuid())
  datasetId         String
  sourceType        SourceType
  location          String
  credentials       String          // encrypted JSON
  status            SourceStatus    @default(ACTIVE)
  lastSyncAt        DateTime?
  createdAt         DateTime        @default(now())
  
  dataset           Dataset         @relation(fields: [datasetId], references: [id])
  
  @@index([datasetId])
  @@map("data_sources")
}
```

#### AccessPolicy
```prisma
model AccessPolicy {
  id                String          @id @default(cuid())
  tenantId          String
  datasetId         String
  name              String
  description       String?
  rules             Json
  epsilonBudget     Decimal?
  watermarkEnabled  Boolean         @default(false)
  status            PolicyStatus    @default(DRAFT)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  
  tenant            Tenant          @relation("ClientPolicies", fields: [tenantId], references: [id])
  dataset           Dataset         @relation(fields: [datasetId], references: [id])
  offers            AccessOffer[]
  executions        PolicyExecution[]
  
  @@index([tenantId])
  @@index([datasetId])
  @@map("access_policies")
}
```

#### AccessOffer
```prisma
model AccessOffer {
  id                String          @id @default(cuid())
  supplierTenantId  String
  datasetId         String
  policyId          String
  title             String
  description       String
  pricePerGb        Decimal
  pricePerHour      Decimal
  status            OfferStatus     @default(DRAFT)
  visibility        Visibility      @default(PRIVATE)
  rating            Decimal?
  reviewCount       Int             @default(0)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  
  supplier          Tenant          @relation("SupplierOffers", fields: [supplierTenantId], references: [id])
  dataset           Dataset         @relation(fields: [datasetId], references: [id])
  policy            AccessPolicy    @relation(fields: [policyId], references: [id])
  leases            Lease[]
  reviews           AccessReview[]
  
  @@index([supplierTenantId])
  @@index([status])
  @@index([visibility])
  @@map("access_offers")
}
```

#### Lease
```prisma
model Lease {
  id                String          @id @default(cuid())
  offerId           String
  buyerTenantId     String
  contractId        String          @unique
  status            LeaseStatus     @default(PENDING)
  startedAt         DateTime?
  expiresAt         DateTime?
  autoRenew         Boolean         @default(false)
  createdAt         DateTime        @default(now())
  
  offer             AccessOffer     @relation(fields: [offerId], references: [id])
  executions        PolicyExecution[]
  
  @@index([buyerTenantId])
  @@index([status])
  @@map("leases")
}
```

#### PolicyExecution
```prisma
model PolicyExecution {
  id                String          @id @default(cuid())
  leaseId           String
  buyerTenantId     String
  policyId          String
  status            ExecutionStatus @default(PENDING)
  bytesProcessed    BigInt          @default(0)
  redactionsApplied BigInt          @default(0)
  costAccrued       Decimal         @default(0)
  startedAt         DateTime?
  completedAt       DateTime?
  createdAt         DateTime        @default(now())
  
  lease             Lease           @relation(fields: [leaseId], references: [id])
  buyer             Tenant          @relation("BuyerExecutions", fields: [buyerTenantId], references: [id])
  policy            AccessPolicy    @relation(fields: [policyId], references: [id])
  evidenceBundles   EvidenceBundle[]
  
  @@index([leaseId])
  @@index([buyerTenantId])
  @@index([status])
  @@map("policy_executions")
}
```

## Services (Business Logic)

### DatasetService

```typescript
// services/dataset.service.ts
export class DatasetService {
  /**
   * Cria novo dataset
   */
  async createDataset(
    tenantId: string,
    data: CreateDatasetInput
  ): Promise<Dataset> {
    // Validação
    const validated = createDatasetSchema.parse(data)
    
    // Criar dataset
    const dataset = await prisma.dataset.create({
      data: {
        tenantId,
        name: validated.name,
        description: validated.description,
        dataType: validated.dataType,
        tags: validated.tags || [],
        status: 'DRAFT'
      }
    })
    
    // Audit log
    await this.auditService.log({
      tenantId,
      action: 'dataset.created',
      resourceType: 'Dataset',
      resourceId: dataset.id,
      metadata: { name: dataset.name }
    })
    
    return dataset
  }
  
  /**
   * Lista datasets do tenant
   */
  async listDatasets(
    tenantId: string,
    filters: DatasetFilters
  ): Promise<PaginatedResult<Dataset>> {
    const where: Prisma.DatasetWhereInput = {
      tenantId,
      ...(filters.status && { status: filters.status }),
      ...(filters.dataType && { dataType: filters.dataType }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ]
      })
    }
    
    const [datasets, total] = await Promise.all([
      prisma.dataset.findMany({
        where,
        include: {
          sources: true,
          policies: true
        },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.dataset.count({ where })
    ])
    
    return {
      data: datasets,
      total,
      page: filters.page,
      limit: filters.limit
    }
  }
  
  /**
   * Adiciona fonte de dados
   */
  async addDataSource(
    datasetId: string,
    data: AddDataSourceInput
  ): Promise<DataSource> {
    // Verificar permissão
    const dataset = await this.getDataset(datasetId)
    
    // Encriptar credenciais
    const encryptedCredentials = await this.cryptoService.encrypt(
      JSON.stringify(data.credentials)
    )
    
    // Criar source
    const source = await prisma.dataSource.create({
      data: {
        datasetId,
        sourceType: data.sourceType,
        location: data.location,
        credentials: encryptedCredentials,
        status: 'ACTIVE'
      }
    })
    
    // Testar conexão
    await this.testDataSourceConnection(source.id)
    
    return source
  }
  
  /**
   * Detecta schema automaticamente
   */
  async detectSchema(
    datasetId: string
  ): Promise<DatasetSchema> {
    const dataset = await this.getDataset(datasetId)
    const sources = await prisma.dataSource.findMany({
      where: { datasetId }
    })
    
    if (sources.length === 0) {
      throw new Error('No data sources configured')
    }
    
    // Ler amostra de dados
    const sample = await this.readSampleData(sources[0])
    
    // Detectar schema baseado no dataType
    switch (dataset.dataType) {
      case 'DICOM':
        return this.detectDICOMSchema(sample)
      case 'FHIR':
        return this.detectFHIRSchema(sample)
      case 'AUDIO':
        return this.detectAudioSchema(sample)
      default:
        return this.detectGenericSchema(sample)
    }
  }
}
```

### PolicyService

```typescript
// services/policy.service.ts
export class PolicyService {
  /**
   * Cria nova política
   */
  async createPolicy(
    tenantId: string,
    data: CreatePolicyInput
  ): Promise<AccessPolicy> {
    // Validação
    const validated = createPolicySchema.parse(data)
    
    // Verificar dataset pertence ao tenant
    const dataset = await prisma.dataset.findFirst({
      where: {
        id: validated.datasetId,
        tenantId
      }
    })
    
    if (!dataset) {
      throw new Error('Dataset not found')
    }
    
    // Validar rules baseado no dataType
    this.validatePolicyRules(dataset.dataType, validated.rules)
    
    // Criar política
    const policy = await prisma.accessPolicy.create({
      data: {
        tenantId,
        datasetId: validated.datasetId,
        name: validated.name,
        description: validated.description,
        rules: validated.rules,
        epsilonBudget: validated.epsilonBudget,
        watermarkEnabled: validated.watermarkEnabled,
        status: 'DRAFT'
      }
    })
    
    return policy
  }
  
  /**
   * Valida política com amostra de dados
   */
  async validatePolicy(
    policyId: string,
    sampleData: string
  ): Promise<PolicyValidationResult> {
    const policy = await this.getPolicy(policyId)
    const dataset = await prisma.dataset.findUnique({
      where: { id: policy.datasetId }
    })
    
    // Decodificar amostra
    const data = Buffer.from(sampleData, 'base64')
    
    // Aplicar regras
    const result = await this.applyPolicyRules(
      dataset.dataType,
      policy.rules,
      data
    )
    
    return {
      valid: true,
      redactionsApplied: result.redactionCount,
      preview: result.processedData.toString('base64').substring(0, 1000),
      warnings: result.warnings
    }
  }
  
  /**
   * Aplica regras de política
   */
  private async applyPolicyRules(
    dataType: DataType,
    rules: PolicyRules,
    data: Buffer
  ): Promise<PolicyApplicationResult> {
    switch (dataType) {
      case 'DICOM':
        return this.applyDICOMRules(rules.dicom, data)
      case 'FHIR':
        return this.applyFHIRRules(rules.fhir, data)
      case 'AUDIO':
        return this.applyAudioRules(rules.audio, data)
      default:
        return this.applyGenericRules(rules, data)
    }
  }
  
  /**
   * Aplica regras DICOM
   */
  private async applyDICOMRules(
    rules: DICOMRules,
    data: Buffer
  ): Promise<PolicyApplicationResult> {
    let redactionCount = 0
    const warnings: string[] = []
    
    // Parse DICOM
    const dicom = await this.parseDICOM(data)
    
    // Remover tags especificadas
    for (const tag of rules.stripTags) {
      if (dicom.hasTag(tag)) {
        dicom.removeTag(tag)
        redactionCount++
      }
    }
    
    // OCR pixel scrubbing
    if (rules.enableOCR) {
      const ocrResult = await this.ocrPixelScrubbing(dicom)
      redactionCount += ocrResult.regionsRedacted
      warnings.push(...ocrResult.warnings)
    }
    
    // Serializar de volta
    const processedData = dicom.serialize()
    
    return {
      processedData,
      redactionCount,
      warnings
    }
  }
  
  /**
   * Aplica regras FHIR
   */
  private async applyFHIRRules(
    rules: FHIRRules,
    data: Buffer
  ): Promise<PolicyApplicationResult> {
    let redactionCount = 0
    const warnings: string[] = []
    
    // Parse FHIR JSON
    const fhir = JSON.parse(data.toString('utf-8'))
    
    // Redact paths especificados
    for (const path of rules.redactPaths) {
      const redacted = this.redactJSONPath(fhir, path)
      if (redacted) redactionCount++
    }
    
    // Date shifting
    if (rules.dateShiftDays !== 0) {
      const shifted = this.shiftDates(fhir, rules.dateShiftDays)
      redactionCount += shifted
    }
    
    // NLP redaction
    if (rules.enableNLP) {
      const nlpResult = await this.nlpRedaction(fhir)
      redactionCount += nlpResult.entitiesRedacted
      warnings.push(...nlpResult.warnings)
    }
    
    const processedData = Buffer.from(JSON.stringify(fhir))
    
    return {
      processedData,
      redactionCount,
      warnings
    }
  }
}
```

### ExecutionService

```typescript
// services/execution.service.ts
export class ExecutionService {
  /**
   * Cria nova execução
   */
  async createExecution(
    leaseId: string,
    buyerTenantId: string
  ): Promise<PolicyExecution> {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        offer: {
          include: {
            policy: true
          }
        }
      }
    })
    
    if (!lease) {
      throw new Error('Lease not found')
    }
    
    if (lease.status !== 'ACTIVE') {
      throw new Error('Lease is not active')
    }
    
    // Criar execução
    const execution = await prisma.policyExecution.create({
      data: {
        leaseId,
        buyerTenantId,
        policyId: lease.offer.policyId,
        status: 'PENDING',
        startedAt: new Date()
      }
    })
    
    // Audit log
    await this.auditService.log({
      tenantId: buyerTenantId,
      action: 'execution.started',
      resourceType: 'PolicyExecution',
      resourceId: execution.id,
      metadata: { leaseId, policyId: lease.offer.policyId }
    })
    
    return execution
  }
  
  /**
   * Atualiza métricas de execução (chamado pelo Sidecar)
   */
  async updateExecutionMetrics(
    executionId: string,
    metrics: ExecutionMetrics
  ): Promise<void> {
    const execution = await prisma.policyExecution.findUnique({
      where: { id: executionId },
      include: {
        lease: {
          include: {
            offer: true
          }
        }
      }
    })
    
    if (!execution) {
      throw new Error('Execution not found')
    }
    
    // Calcular custo
    const bytesProcessedGB = Number(metrics.bytesProcessed) / (1024 ** 3)
    const computeHours = metrics.computeSeconds / 3600
    
    const dataCost = bytesProcessedGB * Number(execution.lease.offer.pricePerGb)
    const computeCost = computeHours * Number(execution.lease.offer.pricePerHour)
    const totalCost = dataCost + computeCost
    
    // Atualizar execução
    await prisma.policyExecution.update({
      where: { id: executionId },
      data: {
        bytesProcessed: metrics.bytesProcessed,
        redactionsApplied: metrics.redactionsApplied,
        costAccrued: totalCost
      }
    })
    
    // Atualizar credit ledger
    await this.billingService.recordUsage(
      execution.buyerTenantId,
      {
        executionId,
        bytesProcessed: metrics.bytesProcessed,
        computeHours,
        cost: totalCost
      }
    )
  }
  
  /**
   * Completa execução
   */
  async completeExecution(
    executionId: string
  ): Promise<PolicyExecution> {
    const execution = await prisma.policyExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    })
    
    // Gerar evidências
    await this.evidenceService.generateEvidenceBundle(executionId)
    
    // Audit log
    await this.auditService.log({
      tenantId: execution.buyerTenantId,
      action: 'execution.completed',
      resourceType: 'PolicyExecution',
      resourceId: execution.id,
      metadata: {
        bytesProcessed: execution.bytesProcessed.toString(),
        costAccrued: execution.costAccrued.toString()
      }
    })
    
    return execution
  }
}
```

### EvidenceService

```typescript
// services/evidence.service.ts
export class EvidenceService {
  /**
   * Gera bundle de evidências
   */
  async generateEvidenceBundle(
    executionId: string
  ): Promise<EvidenceBundle> {
    const execution = await prisma.policyExecution.findUnique({
      where: { id: executionId },
      include: {
        policy: true,
        lease: {
          include: {
            offer: {
              include: {
                dataset: true
              }
            }
          }
        }
      }
    })
    
    if (!execution) {
      throw new Error('Execution not found')
    }
    
    // Coletar evidências
    const evidences: Evidence[] = []
    
    // 1. Policy Applied Evidence
    evidences.push({
      type: 'POLICY_APPLIED',
      timestamp: execution.startedAt!,
      data: {
        policyId: execution.policyId,
        policyName: execution.policy.name,
        rules: execution.policy.rules
      }
    })
    
    // 2. Data Accessed Evidence
    evidences.push({
      type: 'DATA_ACCESSED',
      timestamp: execution.startedAt!,
      data: {
        datasetId: execution.lease.offer.dataset.id,
        datasetName: execution.lease.offer.dataset.name,
        bytesProcessed: execution.bytesProcessed.toString()
      }
    })
    
    // 3. Redaction Proof
    evidences.push({
      type: 'REDACTION_PROOF',
      timestamp: execution.completedAt!,
      data: {
        redactionsApplied: execution.redactionsApplied.toString(),
        method: 'runtime_governance'
      }
    })
    
    // Construir Merkle tree
    const merkleTree = this.buildMerkleTree(evidences)
    const merkleRoot = merkleTree.getRoot()
    
    // Assinar com chave privada do tenant
    const signature = await this.cryptoService.sign(
      merkleRoot,
      execution.buyerTenantId
    )
    
    // Criar bundle
    const bundle = await prisma.evidenceBundle.create({
      data: {
        executionId,
        evidenceType: 'COMPREHENSIVE',
        merkleRoot: merkleRoot.toString('hex'),
        signature: signature.toString('hex'),
        metadata: {
          evidenceCount: evidences.length,
          generatedAt: new Date().toISOString()
        }
      }
    })
    
    // Salvar evidências individuais
    await this.saveEvidences(bundle.id, evidences, merkleTree)
    
    return bundle
  }
  
  /**
   * Constrói Merkle tree
   */
  private buildMerkleTree(evidences: Evidence[]): MerkleTree {
    const leaves = evidences.map(e => 
      this.cryptoService.hash(JSON.stringify(e))
    )
    
    return new MerkleTree(leaves)
  }
  
  /**
   * Verifica bundle de evidências
   */
  async verifyEvidenceBundle(
    bundleId: string
  ): Promise<VerificationResult> {
    const bundle = await prisma.evidenceBundle.findUnique({
      where: { id: bundleId },
      include: {
        execution: {
          include: {
            buyer: true
          }
        }
      }
    })
    
    if (!bundle) {
      throw new Error('Bundle not found')
    }
    
    // Reconstruir Merkle tree
    const evidences = await this.loadEvidences(bundleId)
    const merkleTree = this.buildMerkleTree(evidences)
    const computedRoot = merkleTree.getRoot()
    
    // Verificar root
    const rootValid = computedRoot.toString('hex') === bundle.merkleRoot
    
    // Verificar assinatura
    const signatureValid = await this.cryptoService.verify(
      Buffer.from(bundle.merkleRoot, 'hex'),
      Buffer.from(bundle.signature, 'hex'),
      bundle.execution.buyerTenantId
    )
    
    return {
      valid: rootValid && signatureValid,
      merkleRootValid: rootValid,
      signatureValid,
      evidenceCount: evidences.length
    }
  }
}
```

### BillingService

```typescript
// services/billing.service.ts
export class BillingService {
  /**
   * Registra uso
   */
  async recordUsage(
    tenantId: string,
    usage: UsageRecord
  ): Promise<CreditLedger> {
    const entry = await prisma.creditLedger.create({
      data: {
        tenantId,
        amount: -usage.cost, // Débito
        type: 'USAGE',
        description: `Data processing - ${formatBytes(usage.bytesProcessed)}`,
        metadata: {
          executionId: usage.executionId,
          bytesProcessed: usage.bytesProcessed.toString(),
          computeHours: usage.computeHours
        }
      }
    })
    
    // Verificar saldo
    const balance = await this.getBalance(tenantId)
    
    if (balance < 0) {
      // Enviar alerta de saldo baixo
      await this.notificationService.sendLowBalanceAlert(tenantId, balance)
    }
    
    return entry
  }
  
  /**
   * Calcula uso do mês
   */
  async getMonthlyUsage(
    tenantId: string,
    month: Date
  ): Promise<MonthlyUsage> {
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    
    const executions = await prisma.policyExecution.findMany({
      where: {
        buyerTenantId: tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    })
    
    const totalBytesProcessed = executions.reduce(
      (sum, e) => sum + Number(e.bytesProcessed),
      0
    )
    
    const totalCost = executions.reduce(
      (sum, e) => sum + Number(e.costAccrued),
      0
    )
    
    // Calcular compute hours
    const totalComputeSeconds = executions.reduce((sum, e) => {
      if (!e.startedAt || !e.completedAt) return sum
      return sum + (e.completedAt.getTime() - e.startedAt.getTime()) / 1000
    }, 0)
    
    const computeHours = totalComputeSeconds / 3600
    
    return {
      period: {
        start: startOfMonth,
        end: endOfMonth
      },
      usage: {
        bytesProcessed: totalBytesProcessed,
        computeHours,
        storageGbHours: 0 // TODO: calcular storage
      },
      costs: {
        dataProcessing: totalCost * 0.7, // 70% data
        compute: totalCost * 0.3, // 30% compute
        storage: 0,
        total: totalCost
      }
    }
  }
  
  /**
   * Gera fatura
   */
  async generateInvoice(
    tenantId: string,
    month: Date
  ): Promise<Invoice> {
    const usage = await this.getMonthlyUsage(tenantId, month)
    
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        period: `${month.getFullYear()}-${month.getMonth() + 1}`,
        amount: usage.costs.total,
        status: 'PENDING',
        dueDate: new Date(month.getFullYear(), month.getMonth() + 1, 15),
        metadata: {
          usage: usage.usage,
          breakdown: usage.costs
        }
      }
    })
    
    // Enviar email
    await this.emailService.sendInvoice(tenantId, invoice)
    
    return invoice
  }
}
```

### AuditService

```typescript
// services/audit.service.ts
export class AuditService {
  /**
   * Registra log de auditoria
   */
  async log(entry: AuditLogEntry): Promise<void> {
    // Salvar em ClickHouse (alta performance)
    await this.clickhouse.insert({
      table: 'audit_logs',
      values: [{
        id: generateId(),
        tenant_id: entry.tenantId,
        user_id: entry.userId || null,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        metadata: JSON.stringify(entry.metadata),
        ip_address: entry.ipAddress || null,
        timestamp: new Date()
      }]
    })
    
    // Também salvar em PostgreSQL para queries relacionais
    await prisma.auditLog.create({
      data: entry
    })
  }
  
  /**
   * Consulta logs
   */
  async query(
    tenantId: string,
    filters: AuditLogFilters
  ): Promise<PaginatedResult<AuditLog>> {
    const query = `
      SELECT *
      FROM audit_logs
      WHERE tenant_id = {tenantId:String}
        ${filters.startDate ? 'AND timestamp >= {startDate:DateTime}' : ''}
        ${filters.endDate ? 'AND timestamp <= {endDate:DateTime}' : ''}
        ${filters.action ? 'AND action = {action:String}' : ''}
        ${filters.userId ? 'AND user_id = {userId:String}' : ''}
        ${filters.resourceType ? 'AND resource_type = {resourceType:String}' : ''}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
      OFFSET {offset:UInt32}
    `
    
    const result = await this.clickhouse.query({
      query,
      query_params: {
        tenantId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        action: filters.action,
        userId: filters.userId,
        resourceType: filters.resourceType,
        limit: filters.limit,
        offset: (filters.page - 1) * filters.limit
      }
    })
    
    const logs = await result.json()
    
    // Count total
    const countResult = await this.clickhouse.query({
      query: query.replace('SELECT *', 'SELECT count() as total'),
      query_params: { tenantId, ...filters }
    })
    
    const { total } = await countResult.json()
    
    return {
      data: logs,
      total,
      page: filters.page,
      limit: filters.limit
    }
  }
  
  /**
   * Exporta logs
   */
  async export(
    tenantId: string,
    filters: AuditLogFilters,
    format: 'csv' | 'json'
  ): Promise<Buffer> {
    const logs = await this.query(tenantId, {
      ...filters,
      page: 1,
      limit: 100000 // Max export
    })
    
    if (format === 'csv') {
      return this.convertToCSV(logs.data)
    } else {
      return Buffer.from(JSON.stringify(logs.data, null, 2))
    }
  }
}
```

## API Routes

### Estrutura de API Route

```typescript
// app/api/v1/datasets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DatasetService } from '@/services/dataset.service'
import { createDatasetSchema } from '@/lib/validations/dataset'

const datasetService = new DatasetService()

/**
 * GET /api/v1/datasets
 * Lista datasets do tenant
 */
export async function GET(req: NextRequest) {
  try {
    // Autenticação
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse query params
    const { searchParams } = new URL(req.url)
    const filters = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      status: searchParams.get('status') || undefined,
      dataType: searchParams.get('dataType') || undefined,
      search: searchParams.get('search') || undefined
    }
    
    // Buscar datasets
    const result = await datasetService.listDatasets(
      session.user.tenantId,
      filters
    )
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('GET /api/v1/datasets error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/datasets
 * Cria novo dataset
 */
export async function POST(req: NextRequest) {
  try {
    // Autenticação
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse body
    const body = await req.json()
    
    // Validação
    const validated = createDatasetSchema.parse(body)
    
    // Criar dataset
    const dataset = await datasetService.createDataset(
      session.user.tenantId,
      validated
    )
    
    return NextResponse.json(dataset, { status: 201 })
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }
    
    console.error('POST /api/v1/datasets error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Middlewares

### Auth Middleware

```typescript
// middleware/auth.middleware.ts
export async function withAuth(
  handler: (req: NextRequest, session: Session) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    return handler(req, session)
  }
}
```

### Rate Limit Middleware

```typescript
// middleware/rate-limit.middleware.ts
const rateLimitMap = new Map<string, RateLimitInfo>()

export function withRateLimit(
  limit: number,
  windowMs: number
) {
  return (handler: Function) => {
    return async (req: NextRequest, ...args: any[]) => {
      const key = req.headers.get('x-api-key') || req.ip
      
      const now = Date.now()
      const info = rateLimitMap.get(key) || {
        count: 0,
        resetAt: now + windowMs
      }
      
      if (now > info.resetAt) {
        info.count = 0
        info.resetAt = now + windowMs
      }
      
      info.count++
      rateLimitMap.set(key, info)
      
      if (info.count > limit) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        )
      }
      
      return handler(req, ...args)
    }
  }
}
```

## Validações (Zod)

```typescript
// lib/validations/dataset.ts
export const createDatasetSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  dataType: z.enum(['AUDIO', 'DICOM', 'FHIR', 'TEXT', 'TIMESERIES']),
  tags: z.array(z.string()).optional()
})

export const addDataSourceSchema = z.object({
  sourceType: z.enum(['S3', 'GCS', 'AZURE_BLOB', 'PACS', 'FHIR']),
  location: z.string().url(),
  credentials: z.object({
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    token: z.string().optional()
  })
})

// lib/validations/policy.ts
export const createPolicySchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  datasetId: z.string().cuid(),
  rules: z.object({
    dicom: z.object({
      stripTags: z.array(z.string()),
      enableOCR: z.boolean().optional(),
      enableNIfTI: z.boolean().optional()
    }).optional(),
    fhir: z.object({
      redactPaths: z.array(z.string()),
      dateShiftDays: z.number().int().optional(),
      enableNLP: z.boolean().optional()
    }).optional()
  }),
  epsilonBudget: z.number().positive().optional(),
  watermarkEnabled: z.boolean().optional()
})
```

## Criptografia

```typescript
// lib/crypto.ts
import crypto from 'crypto'

export class CryptoService {
  private algorithm = 'aes-256-gcm'
  private keyLength = 32
  
  /**
   * Encripta dados
   */
  async encrypt(data: string, key?: Buffer): Promise<string> {
    const encryptionKey = key || await this.getEncryptionKey()
    const iv = crypto.randomBytes(16)
    
    const cipher = crypto.createCipheriv(
      this.algorithm,
      encryptionKey,
      iv
    )
    
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Retorna: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  }
  
  /**
   * Decripta dados
   */
  async decrypt(encrypted: string, key?: Buffer): Promise<string> {
    const encryptionKey = key || await this.getEncryptionKey()
    const [ivHex, authTagHex, data] = encrypted.split(':')
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      encryptionKey,
      iv
    )
    
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(data, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }
  
  /**
   * Hash SHA-256
   */
  hash(data: string | Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest()
  }
  
  /**
   * Assina dados
   */
  async sign(data: Buffer, tenantId: string): Promise<Buffer> {
    const privateKey = await this.getPrivateKey(tenantId)
    
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(data)
    
    return sign.sign(privateKey)
  }
  
  /**
   * Verifica assinatura
   */
  async verify(
    data: Buffer,
    signature: Buffer,
    tenantId: string
  ): Promise<boolean> {
    const publicKey = await this.getPublicKey(tenantId)
    
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(data)
    
    return verify.verify(publicKey, signature)
  }
}
```

## Performance e Otimizações

### Database Indexes

```prisma
// Indexes críticos
@@index([tenantId])
@@index([status])
@@index([createdAt])
@@index([tenantId, status])
@@index([tenantId, createdAt])
```

### Query Optimization

```typescript
// Usar select para reduzir dados transferidos
const datasets = await prisma.dataset.findMany({
  select: {
    id: true,
    name: true,
    status: true,
    recordCount: true
  }
})

// Usar include apenas quando necessário
const dataset = await prisma.dataset.findUnique({
  where: { id },
  include: {
    sources: true,
    policies: {
      where: { status: 'ACTIVE' }
    }
  }
})
```

### Caching

```typescript
// Redis cache
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

async function getCachedDataset(id: string): Promise<Dataset | null> {
  const cached = await redis.get(`dataset:${id}`)
  
  if (cached) {
    return JSON.parse(cached)
  }
  
  const dataset = await prisma.dataset.findUnique({ where: { id } })
  
  if (dataset) {
    await redis.setex(`dataset:${id}`, 3600, JSON.stringify(dataset))
  }
  
  return dataset
}
```

---

**Versão:** 2.0.0  
**Data:** 19 de Fevereiro de 2026
