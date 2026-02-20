# Frontend Architecture - Xase Sheets

## Stack Tecnológico

- **Framework:** Next.js 14 (App Router)
- **Linguagem:** TypeScript
- **Styling:** TailwindCSS + shadcn/ui
- **State Management:** React Context + Server Components
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Icons:** Lucide React
- **Auth:** NextAuth.js

## Estrutura de Diretórios

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Grupo de rotas de autenticação
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   ├── app/               # Aplicação principal (autenticada)
│   │   ├── dashboard/
│   │   ├── datasets/
│   │   ├── policies/
│   │   ├── marketplace/
│   │   ├── leases/
│   │   ├── audit/
│   │   ├── evidence/
│   │   ├── billing/
│   │   └── settings/
│   ├── api/               # API Routes
│   │   └── v1/
│   ├── page.tsx           # Landing page
│   ├── pricing/
│   └── layout.tsx
├── components/            # Componentes reutilizáveis
│   ├── ui/               # shadcn/ui components
│   ├── xase/             # Componentes específicos Xase
│   ├── pricing/
│   └── [outros]
├── lib/                   # Utilitários
│   ├── auth.ts
│   ├── prisma.ts
│   ├── utils.ts
│   └── validations/
├── hooks/                 # Custom hooks
├── types/                 # TypeScript types
└── config/               # Configurações
```

## Páginas Principais

### 1. Landing Page (`/`)

**Arquivo:** `src/app/page.tsx`

**Propósito:** Página inicial pública com proposta de valor

**Seções:**
- Hero com CTA
- Problema/Solução
- Features principais
- Como funciona
- Pricing preview
- Testimonials
- FAQ
- Footer

**Componentes:**
```tsx
<LandingHero />
<ProblemSolution />
<FeaturesGrid />
<HowItWorks />
<PricingPreview />
<Testimonials />
<FAQ />
<Footer />
```

### 2. Dashboard (`/app/dashboard`)

**Arquivo:** `src/app/app/dashboard/page.tsx`

**Propósito:** Overview do tenant com métricas principais

**Métricas Exibidas:**
- Datasets ativos
- Bytes processados (mês atual)
- Leases ativos
- Custo acumulado
- Gráfico de uso temporal
- Atividade recente

**Componentes:**
```tsx
<DashboardStats />
<UsageChart />
<ActiveLeases />
<RecentActivity />
```

**Dados Carregados:**
```typescript
// Server Component
async function DashboardPage() {
  const session = await getServerSession()
  const stats = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    include: {
      datasets: { where: { status: 'ACTIVE' } },
      creditLedger: { 
        where: { 
          createdAt: { gte: startOfMonth() } 
        } 
      }
    }
  })
  
  return <Dashboard stats={stats} />
}
```

### 3. Datasets (`/app/datasets`)

**Arquivo:** `src/app/app/datasets/page.tsx`

**Propósito:** Gerenciamento de datasets

**Funcionalidades:**
- Lista de datasets (tabela)
- Filtros (status, tipo de dados)
- Busca
- Criar novo dataset
- Ações rápidas (editar, arquivar, ver detalhes)

**Componentes:**
```tsx
<DatasetsList 
  datasets={datasets}
  onFilter={handleFilter}
  onSearch={handleSearch}
/>
<CreateDatasetButton />
```

**Estado:**
```typescript
const [filters, setFilters] = useState({
  status: 'all',
  dataType: 'all',
  search: ''
})
```

### 4. Dataset Details (`/app/datasets/[id]`)

**Arquivo:** `src/app/app/datasets/[id]/page.tsx`

**Propósito:** Detalhes e configuração de um dataset

**Tabs:**
1. **Overview** - Informações gerais
2. **Sources** - Fontes de dados conectadas
3. **Policies** - Políticas de governança
4. **Access** - Controle de acesso
5. **Analytics** - Métricas de uso

**Componentes:**
```tsx
<DatasetHeader dataset={dataset} />
<Tabs>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="sources">Sources</TabsTrigger>
    <TabsTrigger value="policies">Policies</TabsTrigger>
    <TabsTrigger value="access">Access</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
  </TabsList>
  
  <TabsContent value="overview">
    <DatasetOverview />
  </TabsContent>
  
  <TabsContent value="sources">
    <DataSourcesList />
    <AddDataSourceButton />
  </TabsContent>
  
  {/* ... outros tabs */}
</Tabs>
```

### 5. New Dataset (`/app/datasets/new`)

**Arquivo:** `src/app/app/datasets/new/page.tsx`

**Propósito:** Wizard para criar novo dataset

**Etapas:**
1. **Basic Info** - Nome, descrição, tipo
2. **Data Source** - Conectar S3/PACS/FHIR
3. **Schema Detection** - Auto-detectar schema
4. **Review** - Confirmar e criar

**Componentes:**
```tsx
<CreateDatasetWizard>
  <Step1BasicInfo />
  <Step2DataSource />
  <Step3SchemaDetection />
  <Step4Review />
</CreateDatasetWizard>
```

**Form Validation:**
```typescript
const schema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500),
  dataType: z.enum(['AUDIO', 'DICOM', 'FHIR', 'TEXT', 'TIMESERIES']),
  sourceType: z.enum(['S3', 'GCS', 'AZURE_BLOB', 'PACS', 'FHIR']),
  location: z.string().url(),
  credentials: z.object({...})
})
```

### 6. Policies (`/app/policies`)

**Arquivo:** `src/app/app/policies/page.tsx`

**Propósito:** Gerenciamento de políticas de governança

**Funcionalidades:**
- Lista de políticas
- Templates pré-configurados (HIPAA, GDPR)
- Criar nova política
- Testar política
- Ativar/desativar

**Componentes:**
```tsx
<PoliciesList policies={policies} />
<PolicyTemplates />
<CreatePolicyButton />
```

### 7. Policy Editor (`/app/policies/[policyId]`)

**Arquivo:** `src/app/app/policies/[policyId]/page.tsx`

**Propósito:** Editor visual de políticas

**Seções:**
- **Rules Editor** - Configurar regras de redação
- **Test** - Testar com amostra de dados
- **Rewrite Rules** - Transformações customizadas
- **Privacy Budget** - Configurar epsilon (DP)
- **Watermark** - Configurar watermarking

**Componentes:**
```tsx
<PolicyEditor policy={policy}>
  <RulesEditor 
    dataType={policy.dataset.dataType}
    rules={policy.rules}
    onChange={handleRulesChange}
  />
  
  <TestPanel>
    <SampleDataUpload />
    <TestResults />
  </TestPanel>
  
  <PrivacyBudgetConfig />
  <WatermarkConfig />
</PolicyEditor>
```

**Rules Editor (DICOM):**
```tsx
<DICOMRulesEditor>
  <TagSelector 
    tags={DICOM_TAGS}
    selected={policy.rules.dicom.stripTags}
    onChange={handleTagsChange}
  />
  
  <OCRConfig enabled={policy.rules.dicom.enableOCR} />
  <NIfTIConfig enabled={policy.rules.dicom.enableNIfTI} />
</DICOMRulesEditor>
```

### 8. Marketplace (`/app/marketplace`)

**Arquivo:** `src/app/app/marketplace/page.tsx`

**Propósito:** Descoberta de datasets governados

**Funcionalidades:**
- Grid de ofertas
- Filtros (tipo, preço, rating)
- Busca
- Ordenação (relevância, preço, rating)
- Preview de oferta

**Componentes:**
```tsx
<MarketplaceFilters 
  filters={filters}
  onChange={setFilters}
/>

<OfferGrid>
  {offers.map(offer => (
    <OfferCard 
      key={offer.id}
      offer={offer}
      onPreview={handlePreview}
      onAccept={handleAccept}
    />
  ))}
</OfferGrid>

<OfferPreviewModal 
  offer={selectedOffer}
  open={previewOpen}
  onClose={() => setPreviewOpen(false)}
/>
```

**OfferCard:**
```tsx
<Card>
  <CardHeader>
    <Badge>{offer.dataType}</Badge>
    <h3>{offer.title}</h3>
    <Rating value={offer.rating} />
  </CardHeader>
  
  <CardContent>
    <p>{offer.description}</p>
    
    <div className="stats">
      <Stat label="Records" value={offer.recordCount} />
      <Stat label="Size" value={formatBytes(offer.totalSize)} />
    </div>
    
    <div className="pricing">
      <Price label="Per GB" value={offer.pricePerGb} />
      <Price label="Per Hour" value={offer.pricePerHour} />
    </div>
  </CardContent>
  
  <CardFooter>
    <Button onClick={onPreview}>Preview</Button>
    <Button onClick={onAccept} variant="primary">
      Accept Offer
    </Button>
  </CardFooter>
</Card>
```

### 9. Offer Details (`/app/marketplace/[offerId]`)

**Arquivo:** `src/app/app/marketplace/[offerId]/page.tsx`

**Propósito:** Detalhes completos de uma oferta

**Seções:**
- Overview
- Policy Details (o que será removido)
- Sample Data Preview
- Supplier Info
- Reviews
- Pricing Calculator
- Accept Offer CTA

**Componentes:**
```tsx
<OfferDetails offer={offer}>
  <OfferOverview />
  
  <PolicyPreview policy={offer.policy}>
    <RulesDisplay rules={offer.policy.rules} />
    <PrivacyGuarantees />
  </PolicyPreview>
  
  <SampleDataPreview 
    dataType={offer.dataType}
    samples={offer.samples}
  />
  
  <SupplierInfo supplier={offer.supplier} />
  
  <ReviewsList reviews={offer.reviews} />
  
  <PricingCalculator 
    pricePerGb={offer.pricePerGb}
    pricePerHour={offer.pricePerHour}
    onCalculate={handleCalculate}
  />
  
  <AcceptOfferButton 
    offerId={offer.id}
    onAccept={handleAccept}
  />
</OfferDetails>
```

### 10. Leases (`/app/leases`)

**Arquivo:** `src/app/app/leases/page.tsx`

**Propósito:** Gerenciamento de leases ativos

**Funcionalidades:**
- Lista de leases (ativos, expirados)
- Detalhes de uso
- Renovar lease
- Cancelar lease
- Baixar evidências

**Componentes:**
```tsx
<LeasesList>
  {leases.map(lease => (
    <LeaseCard key={lease.id} lease={lease}>
      <LeaseStatus status={lease.status} />
      <LeaseMetrics 
        bytesProcessed={lease.bytesProcessed}
        costAccrued={lease.costAccrued}
      />
      <LeaseActions>
        <RenewButton />
        <CancelButton />
        <DownloadEvidenceButton />
      </LeaseActions>
    </LeaseCard>
  ))}
</LeasesList>
```

### 11. Audit Logs (`/app/audit`)

**Arquivo:** `src/app/app/audit/page.tsx`

**Propósito:** Visualização de logs de auditoria

**Funcionalidades:**
- Tabela de logs
- Filtros avançados (data, ação, usuário, recurso)
- Busca
- Exportar (CSV, JSON)
- Drill-down em eventos

**Componentes:**
```tsx
<AuditLogFilters 
  filters={filters}
  onChange={setFilters}
/>

<AuditLogTable 
  logs={logs}
  onRowClick={handleRowClick}
/>

<AuditLogDetails 
  log={selectedLog}
  open={detailsOpen}
  onClose={() => setDetailsOpen(false)}
/>

<ExportButton 
  filters={filters}
  format="csv"
  onClick={handleExport}
/>
```

### 12. Evidence (`/app/evidence`)

**Arquivo:** `src/app/app/evidence/page.tsx`

**Propósito:** Gerenciamento de evidências criptográficas

**Funcionalidades:**
- Lista de bundles de evidências
- Verificar assinaturas
- Baixar bundles
- Gerar novo bundle

**Componentes:**
```tsx
<EvidenceBundlesList>
  {bundles.map(bundle => (
    <BundleCard key={bundle.id} bundle={bundle}>
      <MerkleRoot root={bundle.merkleRoot} />
      <Signature signature={bundle.signature} />
      <VerificationStatus verified={bundle.verified} />
      <DownloadButton />
    </BundleCard>
  ))}
</EvidenceBundlesList>

<GenerateEvidenceButton 
  executionId={executionId}
  onClick={handleGenerate}
/>
```

### 13. Billing (`/app/billing`)

**Arquivo:** `src/app/app/billing/page.tsx`

**Propósito:** Faturamento e uso

**Seções:**
- Current Usage (mês atual)
- Cost Breakdown
- Usage Charts
- Invoices History
- Payment Methods

**Componentes:**
```tsx
<CurrentUsage>
  <UsageMetric 
    label="Bytes Processed"
    value={usage.bytesProcessed}
    cost={usage.costs.dataProcessing}
  />
  <UsageMetric 
    label="Compute Hours"
    value={usage.computeHours}
    cost={usage.costs.compute}
  />
  <TotalCost value={usage.costs.total} />
</CurrentUsage>

<CostBreakdownChart data={usage.breakdown} />

<UsageOverTimeChart data={usage.timeseries} />

<InvoicesList invoices={invoices} />

<PaymentMethods methods={paymentMethods} />
```

### 14. Settings (`/app/settings`)

**Arquivo:** `src/app/app/settings/page.tsx`

**Propósito:** Configurações do tenant e usuário

**Tabs:**
1. **Profile** - Informações do usuário
2. **Organization** - Configurações do tenant
3. **API Keys** - Gerenciar API keys
4. **Webhooks** - Configurar webhooks
5. **Security** - 2FA, audit logs
6. **Billing** - Plano e pagamento

**Componentes:**
```tsx
<SettingsTabs>
  <ProfileSettings />
  <OrganizationSettings />
  <ApiKeysManagement />
  <WebhooksConfig />
  <SecuritySettings />
  <BillingSettings />
</SettingsTabs>
```

## Componentes Reutilizáveis

### UI Components (shadcn/ui)

Todos em `src/components/ui/`:

- `button.tsx` - Botões
- `card.tsx` - Cards
- `dialog.tsx` - Modais
- `form.tsx` - Formulários
- `input.tsx` - Inputs
- `select.tsx` - Selects
- `table.tsx` - Tabelas
- `tabs.tsx` - Tabs
- `badge.tsx` - Badges
- `alert.tsx` - Alertas
- `toast.tsx` - Notificações
- `dropdown-menu.tsx` - Menus dropdown
- `sheet.tsx` - Side panels
- `skeleton.tsx` - Loading skeletons

### Xase Components

Em `src/components/xase/`:

#### DatasetCard
```tsx
interface DatasetCardProps {
  dataset: Dataset
  onEdit?: () => void
  onArchive?: () => void
  onViewDetails?: () => void
}

export function DatasetCard({ dataset, ...actions }: DatasetCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <Badge>{dataset.dataType}</Badge>
            <h3>{dataset.name}</h3>
          </div>
          <DropdownMenu>
            <DropdownMenuItem onClick={actions.onEdit}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onArchive}>
              Archive
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-muted-foreground">
          {dataset.description}
        </p>
        
        <div className="stats mt-4">
          <Stat 
            label="Records" 
            value={dataset.recordCount.toLocaleString()} 
          />
          <Stat 
            label="Size" 
            value={formatBytes(dataset.totalSize)} 
          />
          <Stat 
            label="Status" 
            value={<StatusBadge status={dataset.status} />} 
          />
        </div>
      </CardContent>
      
      <CardFooter>
        <Button 
          variant="outline" 
          onClick={actions.onViewDetails}
        >
          View Details
        </Button>
      </CardFooter>
    </Card>
  )
}
```

#### PolicyRulesEditor
```tsx
interface PolicyRulesEditorProps {
  dataType: DataType
  rules: PolicyRules
  onChange: (rules: PolicyRules) => void
}

export function PolicyRulesEditor({ 
  dataType, 
  rules, 
  onChange 
}: PolicyRulesEditorProps) {
  switch (dataType) {
    case 'DICOM':
      return <DICOMRulesEditor rules={rules.dicom} onChange={onChange} />
    case 'FHIR':
      return <FHIRRulesEditor rules={rules.fhir} onChange={onChange} />
    case 'AUDIO':
      return <AudioRulesEditor rules={rules.audio} onChange={onChange} />
    default:
      return <GenericRulesEditor rules={rules} onChange={onChange} />
  }
}
```

#### UsageChart
```tsx
interface UsageChartProps {
  data: UsageDataPoint[]
  metric: 'bytes' | 'cost' | 'requests'
}

export function UsageChart({ data, metric }: UsageChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line 
          type="monotone" 
          dataKey={metric} 
          stroke="#8884d8" 
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

## Fluxos de Interação

### Fluxo 1: Criar Dataset

```
1. User clica "New Dataset" → /app/datasets/new
2. Preenche Step 1 (Basic Info)
   - Nome, descrição, tipo de dados
3. Clica "Next" → Step 2 (Data Source)
   - Seleciona tipo (S3/PACS/FHIR)
   - Preenche credenciais
   - Testa conexão
4. Clica "Next" → Step 3 (Schema Detection)
   - Sistema detecta schema automaticamente
   - User confirma ou ajusta
5. Clica "Next" → Step 4 (Review)
   - Revisa todas as informações
6. Clica "Create Dataset"
   - POST /api/v1/datasets
   - Redirect para /app/datasets/[id]
```

### Fluxo 2: Aceitar Oferta

```
1. User navega para /app/marketplace
2. Busca por "medical images"
3. Clica em oferta → /app/marketplace/[offerId]
4. Revisa detalhes:
   - Policy (o que será removido)
   - Sample data
   - Pricing
5. Clica "Accept Offer"
6. Modal abre com form:
   - Duration (7d, 30d, 90d)
   - Estimated GB
   - Pricing calculator
7. Confirma → POST /api/v1/access-offers/[offerId]/accept
8. Recebe:
   - Lease ID
   - API Key
   - Sidecar config
9. Modal mostra instruções de setup:
   ```bash
   helm install xase-sidecar ...
   ```
10. User copia comandos
11. Redirect para /app/leases/[leaseId]
```

### Fluxo 3: Renovar Lease

```
1. User recebe notificação: "Lease expira em 24h"
2. Clica notificação → /app/leases/[leaseId]
3. Vê banner: "This lease expires soon"
4. Clica "Renew"
5. Modal abre:
   - Seleciona duração
   - Vê custo estimado
6. Confirma → POST /api/v1/leases/[leaseId]/renew
7. Toast: "Lease renewed successfully"
8. Página atualiza com nova data de expiração
```

## State Management

### Server Components (Padrão)

Maioria das páginas usa Server Components para fetch de dados:

```tsx
// app/datasets/page.tsx
export default async function DatasetsPage() {
  const session = await getServerSession()
  
  const datasets = await prisma.dataset.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      sources: true,
      policies: true
    }
  })
  
  return <DatasetsList datasets={datasets} />
}
```

### Client Components (Interatividade)

Componentes com interação usam Client Components:

```tsx
'use client'

export function DatasetsList({ datasets }: { datasets: Dataset[] }) {
  const [filters, setFilters] = useState({...})
  const [search, setSearch] = useState('')
  
  const filtered = useMemo(() => {
    return datasets.filter(d => 
      d.name.includes(search) &&
      (filters.status === 'all' || d.status === filters.status)
    )
  }, [datasets, search, filters])
  
  return (
    <div>
      <Filters filters={filters} onChange={setFilters} />
      <SearchInput value={search} onChange={setSearch} />
      <DatasetGrid datasets={filtered} />
    </div>
  )
}
```

### React Context (Estado Global)

Para estado compartilhado:

```tsx
// contexts/TenantContext.tsx
const TenantContext = createContext<TenantContextValue>(null)

export function TenantProvider({ children, tenant }) {
  const [currentTenant, setCurrentTenant] = useState(tenant)
  
  return (
    <TenantContext.Provider value={{ currentTenant, setCurrentTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}
```

## Autenticação

### NextAuth.js Setup

```typescript
// lib/auth.ts
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      credentials: {
        email: {},
        password: {}
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true }
        })
        
        if (!user || !await bcrypt.compare(credentials.password, user.password)) {
          return null
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.xaseRole
        }
      }
    }),
    GoogleProvider({...}),
    GitHubProvider({...})
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.user.tenantId = token.tenantId
      session.user.role = token.role
      return session
    }
  }
}
```

### Protected Routes

```tsx
// app/app/layout.tsx
export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }
  
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

## Styling

### TailwindCSS

Configuração em `tailwind.config.ts`:

```typescript
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {...},
        secondary: {...},
        accent: {...}
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
```

### shadcn/ui Theming

```css
/* app/globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    /* ... */
  }
  
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

## Performance

### Otimizações

1. **Server Components** - Fetch no servidor
2. **Streaming** - Suspense boundaries
3. **Image Optimization** - next/image
4. **Code Splitting** - Dynamic imports
5. **Caching** - React cache()

```tsx
// Streaming com Suspense
<Suspense fallback={<DatasetsSkeleton />}>
  <DatasetsList />
</Suspense>

// Dynamic import
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />
})
```

## Testing

### Unit Tests (Jest + React Testing Library)

```typescript
// __tests__/components/DatasetCard.test.tsx
describe('DatasetCard', () => {
  it('renders dataset information', () => {
    const dataset = mockDataset()
    render(<DatasetCard dataset={dataset} />)
    
    expect(screen.getByText(dataset.name)).toBeInTheDocument()
    expect(screen.getByText(dataset.dataType)).toBeInTheDocument()
  })
  
  it('calls onEdit when edit button clicked', () => {
    const onEdit = jest.fn()
    render(<DatasetCard dataset={mockDataset()} onEdit={onEdit} />)
    
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalled()
  })
})
```

### E2E Tests (Playwright)

```typescript
// e2e/dataset-creation.spec.ts
test('create new dataset', async ({ page }) => {
  await page.goto('/app/datasets/new')
  
  await page.fill('[name="name"]', 'Test Dataset')
  await page.selectOption('[name="dataType"]', 'DICOM')
  await page.click('button:has-text("Next")')
  
  await page.fill('[name="location"]', 's3://test-bucket')
  await page.click('button:has-text("Create")')
  
  await expect(page).toHaveURL(/\/app\/datasets\/\w+/)
})
```

---

**Versão:** 2.0.0  
**Data:** 19 de Fevereiro de 2026
