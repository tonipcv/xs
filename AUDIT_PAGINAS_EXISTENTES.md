# AUDIT: Páginas Existentes no Sistema

## DUPLICAÇÃO CONFIRMADA: /voice/ vs /ai-holder/

### Datasets (100% duplicado)
- `/xase/voice/datasets/page.tsx` ≈ `/xase/ai-holder/datasets/page.tsx`
- `/xase/voice/datasets/new/page.tsx` ≈ `/xase/ai-holder/datasets/new/page.tsx`
- `/xase/voice/datasets/[datasetId]/page.tsx` ≈ `/xase/ai-holder/datasets/[datasetId]/page.tsx`
- `/xase/voice/datasets/[datasetId]/upload/page.tsx` ≈ `/xase/ai-holder/datasets/[datasetId]/upload/page.tsx`
- `/xase/voice/datasets/[datasetId]/stream/page.tsx` ≈ `/xase/ai-holder/datasets/[datasetId]/stream/page.tsx`
- `/xase/voice/datasets/[datasetId]/lab/page.tsx` ≈ `/xase/ai-holder/datasets/[datasetId]/lab/page.tsx`
- `/xase/voice/datasets/browse/page.tsx` ≈ `/xase/ai-holder/datasets/browse/page.tsx`

### Policies (100% duplicado)
- `/xase/voice/policies/page.tsx` ≈ `/xase/ai-holder/policies/page.tsx`
- `/xase/voice/policies/new/page.tsx` ≈ `/xase/ai-holder/policies/new/page.tsx`
- `/xase/voice/policies/[policyId]/test/page.tsx` ≈ `/xase/ai-holder/policies/[policyId]/test/page.tsx`
- `/xase/voice/policies/[policyId]/rewrite-rules/page.tsx` ≈ `/xase/ai-holder/policies/[policyId]/rewrite-rules/page.tsx`

### Leases (100% duplicado)
- `/xase/voice/leases/page.tsx` ≈ `/xase/ai-holder/leases/page.tsx`

### Access Logs (100% duplicado)
- `/xase/voice/access-logs/page.tsx` ≈ `/xase/ai-holder/access-logs/page.tsx`

### Ledger (100% duplicado)
- `/xase/voice/ledger/page.tsx` ≈ `/xase/ai-holder/ledger/page.tsx`

### Offers (100% duplicado)
- `/xase/voice/offers/new/page.tsx` ≈ `/xase/ai-holder/offers/new/page.tsx`

### Dashboard (100% duplicado)
- `/xase/voice/page.tsx` ≈ `/xase/ai-holder/page.tsx`

## PÁGINAS ÚNICAS (não duplicadas)

### Voice-specific
- `/xase/voice/setup/page.tsx` (onboarding)
- `/xase/voice/evidence/print/page.tsx` (evidence bundles)
- `/xase/voice/client/page.tsx` (client dashboard)
- `/xase/voice/client/access/page.tsx`
- `/xase/voice/client/billing/page.tsx`
- `/xase/voice/client/policies/page.tsx`

### AI Lab (client role)
- `/xase/ai-lab/page.tsx` (dashboard)
- `/xase/ai-lab/training/page.tsx`
- `/xase/ai-lab/billing/page.tsx`
- `/xase/ai-lab/marketplace/page.tsx`
- `/xase/ai-lab/usage/page.tsx`
- `/xase/ai-lab/webhooks/page.tsx`

### Shared/Global
- `/xase/audit/page.tsx`
- `/xase/compliance/page.tsx`
- `/xase/consent/page.tsx`
- `/xase/bundles/page.tsx` (evidence)
- `/xase/watermark/page.tsx`
- `/xase/executions/page.tsx`
- `/xase/executions/[executionId]/page.tsx`
- `/xase/governed-access/page.tsx` (marketplace)
- `/xase/governed-access/[offerId]/page.tsx`
- `/xase/health/page.tsx`
- `/xase/metrics/page.tsx`
- `/xase/observability/page.tsx`
- `/xase/privacy/epsilon/page.tsx`
- `/xase/settings/page.tsx`
- `/xase/api-keys/page.tsx`
- `/xase/admin/api-keys/page.tsx`
- `/xase/sidecar/page.tsx`
- `/xase/training/page.tsx`
- `/xase/training/leases/[leaseId]/page.tsx`
- `/xase/training/request-lease/page.tsx`
- `/xase/usage-billing/page.tsx`
- `/xase/connectors/page.tsx`
- `/xase/dashboard/page.tsx`
- `/xase/docs/page.tsx`
- `/xase/profile/page.tsx`
- `/xase/profile/security/2fa/page.tsx`
- `/xase/security/rbac/page.tsx`

## ESTRATÉGIA DE MIGRAÇÃO

### Fase 1: Criar estrutura /app/ usando páginas existentes (SEM duplicar código)

#### /app/datasets/* → usar `/xase/ai-holder/datasets/*` (manter voice como será deletado)
- `/app/datasets/page.tsx` → importa lógica de `/xase/ai-holder/datasets/page.tsx`
- `/app/datasets/new/page.tsx` → importa de `/xase/ai-holder/datasets/new/page.tsx`
- `/app/datasets/[id]/page.tsx` → importa de `/xase/ai-holder/datasets/[datasetId]/page.tsx`
- `/app/datasets/[id]/upload/page.tsx` → importa de `/xase/ai-holder/datasets/[datasetId]/upload/page.tsx`
- `/app/datasets/[id]/sources/page.tsx` → renomear de `browse`
- `/app/datasets/[id]/preview/page.tsx` → renomear de `stream` + `lab`

#### /app/policies/* → usar `/xase/ai-holder/policies/*`
- `/app/policies/page.tsx` → importa de `/xase/ai-holder/policies/page.tsx`
- `/app/policies/new/page.tsx` → importa de `/xase/ai-holder/policies/new/page.tsx`
- `/app/policies/[id]/page.tsx` → criar (detail view)
- `/app/policies/[id]/test/page.tsx` → importa de `/xase/ai-holder/policies/[policyId]/test/page.tsx`

#### /app/marketplace/* → usar `/xase/governed-access/*`
- `/app/marketplace/page.tsx` → importa de `/xase/governed-access/page.tsx`
- `/app/marketplace/[offerId]/page.tsx` → importa de `/xase/governed-access/[offerId]/page.tsx`
- `/app/marketplace/publish/page.tsx` → importa de `/xase/ai-holder/offers/new/page.tsx`

#### /app/leases/* → usar `/xase/ai-holder/leases/*`
- `/app/leases/page.tsx` → importa de `/xase/ai-holder/leases/page.tsx`
- `/app/leases/[id]/page.tsx` → criar (detail view)

#### /app/training/* → usar `/xase/ai-lab/training/*` + `/xase/training/*`
- `/app/training/page.tsx` → importa de `/xase/ai-lab/training/page.tsx`
- `/app/training/[leaseId]/page.tsx` → importa de `/xase/training/leases/[leaseId]/page.tsx`
- `/app/training/sidecar/page.tsx` → importa de `/xase/sidecar/page.tsx`

#### /app/evidence/* → usar `/xase/bundles/*`
- `/app/evidence/page.tsx` → importa de `/xase/bundles/page.tsx`
- `/app/evidence/[bundleId]/page.tsx` → criar

#### /app/compliance/* → usar `/xase/compliance/*`
- `/app/compliance/page.tsx` → importa de `/xase/compliance/page.tsx`

#### /app/billing/* → usar `/xase/ai-lab/billing/*` + `/xase/ai-holder/ledger/*`
- `/app/billing/page.tsx` → unificar billing + ledger

#### /app/audit/* → usar `/xase/audit/*`
- `/app/audit/page.tsx` → importa de `/xase/audit/page.tsx`

#### /app/settings/* → usar `/xase/settings/*` + `/xase/api-keys/*`
- `/app/settings/page.tsx` → importa de `/xase/settings/page.tsx`
- `/app/settings/api-keys/page.tsx` → importa de `/xase/api-keys/page.tsx`
- `/app/settings/security/page.tsx` → importa de `/xase/profile/security/2fa/page.tsx`
- `/app/settings/webhooks/page.tsx` → importa de `/xase/ai-lab/webhooks/page.tsx`

#### /app/dashboard/page.tsx → criar unificado (adapta por role)

### Fase 2: Redirects em next.config.mjs
```js
redirects: [
  { source: '/xase/ai-holder/:path*', destination: '/app/:path*', permanent: true },
  { source: '/xase/voice/:path*', destination: '/app/:path*', permanent: true },
  { source: '/xase/ai-lab/training', destination: '/app/training', permanent: true },
  { source: '/xase/ai-lab/billing', destination: '/app/billing', permanent: true },
  { source: '/xase/ai-lab/marketplace', destination: '/app/marketplace', permanent: true },
  { source: '/xase/governed-access/:path*', destination: '/app/marketplace/:path*', permanent: true },
  { source: '/xase/bundles/:path*', destination: '/app/evidence/:path*', permanent: true },
]
```

### Fase 3: Atualizar componentes
- `DatasetCard.tsx` → aceitar `basePath` prop
- `AppSidebar.tsx` → atualizar links para `/app/*`
- Todos os `Link` components → buscar e substituir `/xase/voice/` e `/xase/ai-holder/`

### Fase 4: Deletar
- `/xase/voice/` (inteiro)
- `/xase/ai-holder/` (inteiro)
- Manter temporariamente: `/xase/ai-lab/`, `/xase/governed-access/`, etc até redirects funcionarem

## TOTAL DE PÁGINAS
- **Existentes**: 73 páginas
- **Duplicadas**: ~20 páginas (voice vs ai-holder)
- **Meta após cleanup**: ~30-35 páginas
