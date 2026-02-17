# XASE — Reestruturação de UX, Navegação e Rotas

> 17 fev 2026

---

## DIAGNÓSTICO

### O que está errado

| Problema | Impacto |
|----------|---------|
| `/xase/voice/` e `/xase/ai-holder/` são cópias com 15+ páginas duplicadas | Manutenção impossível, bugs em um não corrige no outro |
| AI Holder pages linkam para `/xase/voice/*` nas ações (criar, detalhe, browse) | User vai parar em URL errada, confusão total |
| 3 dashboards de AI Lab (`/ai-lab`, `/ai-lab/training`, `/voice/client`) | Nenhum funciona direito, principal mostra zeros |
| APIs duplicadas: `/api/v1/datasets`, `/api/xase/datasets`, `/api/xase/voice/datasets` | Cada uma com validação diferente, bugs difíceis de rastrear |
| `DatasetCard.tsx` hardcoda `/xase/voice/` para todos os links | Não importa onde o user está, sempre cai no voice |
| Marketplace em `/xase/governed-access` E `/xase/ai-lab/marketplace` | Código duplicado, divergem com o tempo |
| `Navigation.tsx` referencia "IA Biblica" — produto antigo | Dead code confuso |
| `BottomNavigation.tsx` mostra AI Holder + AI Lab para todos | Quebra isolamento de roles |
| `/xase/data-holder/connectors` linkado mas não existe | 404 para o user |
| 20+ páginas órfãs sem link no sidebar | Features escondidas |

---

## SOLUÇÃO: ESTRUTURA NOVA

### Princípio: 1 rota canônica por conceito, 0 duplicatas

### Nova Árvore de Páginas

```
/login
/register
/forgot-password
/reset-password

/app                              ← layout com sidebar dinâmico por role
├── /app/dashboard                ← dashboard unificado (adapta por role)
│
├── /app/datasets                 ← CRUD datasets (supplier only)
│   ├── /app/datasets/new
│   ├── /app/datasets/[id]
│   ├── /app/datasets/[id]/upload
│   ├── /app/datasets/[id]/sources   ← conectar dados (substitui browse/connectors)
│   └── /app/datasets/[id]/preview   ← stream/lab unificado
│
├── /app/policies                 ← CRUD policies (supplier only)
│   ├── /app/policies/new
│   ├── /app/policies/[id]
│   └── /app/policies/[id]/test
│
├── /app/marketplace              ← catálogo de offers (ambos roles)
│   ├── /app/marketplace/[offerId]
│   └── /app/marketplace/publish  ← publicar offer (supplier only)
│
├── /app/leases                   ← gerenciar leases (ambos roles, view diferente)
│   └── /app/leases/[id]
│
├── /app/training                 ← setup sidecar + streaming (client only)
│   ├── /app/training/[leaseId]
│   └── /app/training/sidecar     ← config/status do sidecar
│
├── /app/evidence                 ← bundles + merkle + PDF (supplier)
│   └── /app/evidence/[bundleId]
│
├── /app/compliance               ← GDPR, BaFin, FCA, AI Act (ambos)
│
├── /app/billing                  ← ledger + usage + Stripe (ambos)
│
├── /app/settings                 ← perfil, API keys, 2FA, RBAC, webhooks
│   ├── /app/settings/api-keys
│   ├── /app/settings/security
│   └── /app/settings/webhooks
│
└── /app/audit                    ← audit trail + access logs (ambos)
```

### Nova Árvore de APIs

```
/api/auth/                        ← mantém (login, register, 2fa, reset)

/api/v1/                          ← API ÚNICA (session + API key auth)
├── /api/v1/datasets              ← GET, POST
├── /api/v1/datasets/[id]         ← GET, PATCH, DELETE
├── /api/v1/datasets/[id]/upload  ← POST
├── /api/v1/datasets/[id]/sources ← GET, POST, DELETE
├── /api/v1/datasets/[id]/publish ← POST
├── /api/v1/datasets/[id]/stream  ← GET
│
├── /api/v1/policies              ← GET, POST
├── /api/v1/policies/[id]         ← GET, PATCH, DELETE
├── /api/v1/policies/[id]/test    ← POST
│
├── /api/v1/offers                ← GET, POST (renomear de access-offers)
├── /api/v1/offers/[id]           ← GET, PATCH
├── /api/v1/offers/[id]/accept    ← POST (renomear de execute)
│
├── /api/v1/leases                ← GET, POST
├── /api/v1/leases/[id]           ← GET
├── /api/v1/leases/[id]/extend    ← POST
├── /api/v1/leases/[id]/revoke    ← POST
│
├── /api/v1/evidence              ← GET, POST
├── /api/v1/evidence/[id]         ← GET
├── /api/v1/evidence/[id]/pdf     ← GET
│
├── /api/v1/billing/usage         ← GET
├── /api/v1/billing/ledger        ← GET
│
├── /api/v1/audit                 ← GET (unificar Prisma + ClickHouse)
├── /api/v1/consent               ← GET, POST, DELETE
│
├── /api/v1/sidecar/auth          ← POST
├── /api/v1/sidecar/telemetry     ← POST
├── /api/v1/sidecar/kill-switch   ← GET, POST
│
├── /api/v1/settings              ← GET, PUT
├── /api/v1/api-keys              ← GET, POST, DELETE
├── /api/v1/health                ← GET
└── /api/v1/metrics               ← GET

DELETAR:
  /api/xase/*                     ← tudo (duplicata do v1)
  /api/xase/v1/*                  ← tudo (terceira cópia)
  /api/xase/voice/*               ← tudo (duplicata)
  /api/xase/debug/*               ← não deveria existir
```

---

## SIDEBAR NOVO

### Supplier (AI Holder / Data Holder)

```
📊 Dashboard
📁 Datasets          → /app/datasets
📋 Policies          → /app/policies
🏪 Marketplace       → /app/marketplace
📄 Leases            → /app/leases
🔒 Evidence          → /app/evidence
📈 Billing           → /app/billing
📝 Audit             → /app/audit
⚖️  Compliance        → /app/compliance
⚙️  Settings          → /app/settings
```

### Client (AI Lab)

```
📊 Dashboard
🏪 Marketplace       → /app/marketplace
🚀 Training          → /app/training
📄 Leases            → /app/leases
📈 Billing           → /app/billing
📝 Audit             → /app/audit
⚖️  Compliance        → /app/compliance
⚙️  Settings          → /app/settings
```

**Deletar**: `BottomNavigation.tsx`, `Navigation.tsx` (dead code)

---

## FLUXO UX CORRIGIDO

### Data Holder: "Tenho dados" → "Dados no marketplace"

```
1. Dashboard → "Create Dataset"
2. /app/datasets/new → nome, descrição, tipo
3. /app/datasets/[id]/sources → conectar S3/GCS/upload direto
4. /app/datasets/[id] → ver dados conectados, criar policy inline
5. /app/marketplace/publish → selecionar dataset + policy → publicar offer
6. Offer aparece no marketplace automaticamente
```

**Antes**: 6 páginas diferentes, 3 hierarquias cruzadas, link quebrado para `/xase/data-holder/connectors`
**Depois**: 5 passos lineares, tudo dentro de `/app/`

### AI Lab: "Preciso de dados" → "Treinando com sidecar"

```
1. Dashboard → "Browse Marketplace"
2. /app/marketplace → filtrar offers por tipo/preço/jurisdição
3. /app/marketplace/[offerId] → ver detalhes, custo estimado
4. "Accept Offer" → cria lease automaticamente
5. /app/training/[leaseId] → instruções do sidecar + SDK snippet
6. Copia snippet Python → treina
```

**Antes**: 3 dashboards, marketplace duplicado, links cruzados para `/xase/voice/client/*`
**Depois**: 6 passos lineares, 0 confusão

---

## O QUE DELETAR

### Páginas (mover lógica útil antes de deletar)

| Deletar | Motivo | Substituído por |
|---------|--------|----------------|
| `src/app/xase/voice/` (inteiro) | Duplicata de ai-holder | `/app/datasets`, `/app/policies`, etc |
| `src/app/xase/ai-holder/` (inteiro) | Mover para `/app/` | `/app/datasets`, `/app/policies`, etc |
| `src/app/xase/ai-lab/` (inteiro) | Mover para `/app/` | `/app/dashboard`, `/app/training` |
| `src/app/xase/governed-access/` | Duplicata | `/app/marketplace` |
| `src/app/xase/dashboard/` | Órfão | `/app/dashboard` |
| `src/app/xase/training/` | Mover | `/app/training` |
| `src/app/xase/bundles/` | Mover | `/app/evidence` |
| `src/app/xase/sidecar/` | Mover | `/app/training/sidecar` |
| `src/app/xase/watermark/` | Mover | `/app/evidence` (seção) |
| `src/app/xase/records/` | Mover | `/app/audit` (seção) |
| `src/app/xase/executions/` | Mover | `/app/audit` (seção) |
| `src/app/xase/consent/` | Mover | `/app/compliance` (seção) |
| `src/app/xase/privacy/` | Mover | `/app/compliance` (seção) |
| `src/app/xase/security/` | Mover | `/app/settings/security` |
| `src/app/xase/observability/` | Mover | `/app/settings` ou dashboard |
| `src/app/xase/health/` | Mover | `/app/settings` |
| `src/app/xase/metrics/` | Mover | Dashboard |
| `src/app/xase/docs/` | Mover | `/app/docs` ou link externo |
| `src/app/xase/connectors/` | Mover | `/app/datasets/[id]/sources` |

### APIs

| Deletar | Motivo |
|---------|--------|
| `src/app/api/xase/datasets/` | Duplicata de `/api/v1/datasets` |
| `src/app/api/xase/voice/` (inteiro) | Duplicata |
| `src/app/api/xase/v1/api-keys/` | Terceira cópia |
| `src/app/api/xase/v1/audit/` | Terceira cópia |
| `src/app/api/xase/api-keys/` | Duplicata |
| `src/app/api/xase/audit/` | Duplicata |
| `src/app/api/xase/debug/` | Não deveria existir em prod |
| `src/app/api/dev/` | Não deveria existir em prod |

### Componentes

| Deletar/Unificar | Motivo |
|---------|--------|
| `BottomNavigation.tsx` | Quebra role isolation, design conflitante |
| `Navigation.tsx` | Dead code, referencia "IA Biblica" |
| `publish-access-offer-button.tsx` | Duplicata de `PublishAccessOfferLink.tsx` |
| `onboarding/OnboardingWizard.tsx` | Duplicata de `OnboardingWizard.tsx` |

---

## COMPONENTES PARA CORRIGIR

### `DatasetCard.tsx`
- **Problema**: Hardcoda `/xase/voice/datasets/{id}` e `/xase/voice/policies`
- **Fix**: Aceitar `basePath` como prop, default para `/app/datasets`

### `LeasesTable.tsx` (existe em 2 lugares)
- **Problema**: Cópia em `ai-holder/leases/` e `voice/leases/`
- **Fix**: Componente único em `src/components/xase/LeasesTable.tsx`

### `AppSidebar.tsx`
- **Fix**: Atualizar links para `/app/*`, remover referências a `/xase/voice/` e `/xase/ai-holder/`

---

## PLANO DE EXECUÇÃO

### Fase 1: Criar estrutura nova (sem quebrar a antiga)
1. Criar `/app/` layout com sidebar novo
2. Criar páginas novas importando componentes existentes (não copiar código)
3. Testar cada página nova funciona

### Fase 2: Redirecionar rotas antigas
1. Adicionar redirects em `next.config.mjs`:
   ```js
   redirects: [
     { source: '/xase/ai-holder/:path*', destination: '/app/:path*', permanent: true },
     { source: '/xase/voice/:path*', destination: '/app/:path*', permanent: true },
     { source: '/xase/ai-lab/:path*', destination: '/app/:path*', permanent: true },
     { source: '/xase/governed-access/:path*', destination: '/app/marketplace/:path*', permanent: true },
   ]
   ```

### Fase 3: Unificar APIs
1. Garantir `/api/v1/` aceita session auth (já aceita)
2. Atualizar frontend para usar só `/api/v1/`
3. Deletar `/api/xase/` e `/api/xase/v1/`

### Fase 4: Cleanup
1. Deletar páginas antigas
2. Deletar componentes duplicados
3. Deletar APIs duplicadas
4. Remover redirects temporários

---

## MÉTRICAS DE SUCESSO

| Antes | Depois |
|-------|--------|
| 87 páginas | ~25 páginas |
| ~150 API routes | ~40 API routes |
| 3 nav components | 1 nav component |
| 3 client dashboards | 1 dashboard adaptativo |
| 15+ páginas duplicadas | 0 duplicatas |
| Links quebrados para `/xase/voice/` | 0 links cruzados |
| `/xase/data-holder/connectors` = 404 | 0 rotas 404 |
