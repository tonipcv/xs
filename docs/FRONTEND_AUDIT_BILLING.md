# Frontend Audit - Billing Hybrid Migration

## Páginas Identificadas para Atualização

### 1. Pricing Público (`/pricing`)
**Arquivo:** `src/app/pricing/page.tsx`
**Status:** ❌ Precisa atualização completa
**Problemas:**
- Mostra "Pay Per Use" com "$XX-$XXX per hour"
- Exemplo de cálculo baseado em "100h @ $50/h"
- Não reflete modelo Hybrid (base + uso por unidade técnica)

**Ação:** Reescrever completamente para mostrar:
- Base mensal por hospital/tenant
- Pricing por DICOM images, FHIR resources, Audio minutes, Text pages
- Exemplos de fatura mensal real

---

### 2. Billing Dashboard (`/app/billing`)
**Arquivo:** `src/app/app/billing/page.tsx`
**Status:** ⚠️ Parcialmente OK, precisa enriquecimento
**Problemas:**
- Mostra apenas CreditLedger (modelo antigo)
- Não mostra métricas do Sidecar (DICOM/FHIR/Audio/Text)
- Não integra com BillingSnapshot

**Ação:** Adicionar:
- Gráficos de uso por pipeline (DICOM, FHIR, Audio, Text)
- Projeção de fatura mensal
- Alertas de quota (80%, 100%)
- Download de relatório CSV

---

### 3. Marketplace - Governed Access (`/app/marketplace/governed-access`)
**Arquivo:** `src/app/app/marketplace/governed-access/page.tsx`
**Status:** ❌ Tem filtro "Max Price (per hour)"
**Problemas:**
- Linha 88: "Max Price (per hour)" input
- Linha 37: `maxPrice` query param enviado para API

**Ação:** Remover filtro de preço por hora

---

### 4. Access Offer Card
**Arquivo:** `src/components/xase/access-offer-card.tsx`
**Status:** ✅ Já atualizado (pricing removido)
**Ação:** Nenhuma

---

### 5. Publish Access Offer Button
**Arquivo:** `src/components/xase/publish-access-offer-button.tsx`
**Status:** ❌ Formulário com "Price per Hour"
**Problemas:**
- Linha 48: `priceModel: 'PAY_PER_HOUR'`
- Linha 49: `pricePerHour: 10`
- Linha 253-260: Input "Price per Hour"

**Ação:** Atualizar formulário para modelo Hybrid ou remover (se não for mais usado)

---

### 6. Access Plan Wizard
**Arquivo:** `src/components/xase/access-plan/AccessPlanWizard.tsx`
**Status:** ❌ Wizard com pricing por hora
**Problemas:**
- Linha 24: `pricePerHour: number`
- Linha 56: `pricePerHour: 15`
- Linha 230-238: Input "Price per Hour ($)"

**Ação:** Atualizar wizard para modelo Hybrid

---

### 7. Pricing Templates
**Arquivo:** `src/components/xase/access-plan/PricingTemplates.tsx`
**Status:** ❌ Templates com pricing por hora
**Problemas:**
- Linha 12: `pricePerHour: number`
- Templates: Starter ($5/h), Pro ($15/h), Enterprise (custom)

**Ação:** Atualizar templates para modelo Hybrid

---

## Novas Páginas a Criar

### 8. Request Access Form (`/app/marketplace/request-access`)
**Status:** 🆕 Criar nova página
**Funcionalidade:**
- Formulário de lead capture
- Campos: nome, email, empresa, use case, volume estimado
- Integração com CRM/email
- Confirmação de envio

---

### 9. Billing Self-Service Dashboard (`/app/billing/usage`)
**Status:** 🆕 Criar nova página
**Funcionalidade:**
- Gráficos de uso por pipeline (DICOM, FHIR, Audio, Text)
- Quota atual vs limite
- Projeção de fatura mensal
- Histórico de faturas (últimos 12 meses)
- Download de relatórios CSV
- Alertas configuráveis

---

## Componentes Backend a Atualizar

### 10. Validações
**Arquivo:** `src/lib/validations/access-offer.ts`
**Status:** ❌ Schema com pricePerHour
**Ação:** Atualizar schema para modelo Hybrid

---

### 11. Cost Calculator
**Arquivo:** `src/lib/xase/cost-calculator.ts`
**Status:** ❌ Cálculo baseado em pricePerHour
**Ação:** Atualizar para calcular por unidade técnica

---

### 12. Dynamic Pricing
**Arquivo:** `src/lib/pricing/dynamic-pricing.ts`
**Status:** ❌ Lógica baseada em basePricePerHour
**Ação:** Atualizar ou deprecar (se não for mais usado)

---

### 13. Access Enforcement
**Arquivo:** `src/lib/xase/access-enforcement.ts`
**Status:** ❌ Enforcement baseado em hoursToConsume * pricePerHour
**Ação:** Atualizar para modelo Hybrid

---

## Priorização

### P0 (Crítico - Fazer Agora)
1. ✅ Remover pricing por hora do marketplace card (já feito)
2. Atualizar `/pricing` público para modelo Hybrid
3. Remover filtro "Max Price" do marketplace
4. Criar página Request Access Form

### P1 (Alto - Próxima Sprint)
5. Enriquecer Billing Dashboard com métricas Sidecar
6. Criar Billing Self-Service Dashboard
7. Atualizar Access Plan Wizard
8. Atualizar Pricing Templates

### P2 (Médio - Backlog)
9. Atualizar validações e schemas
10. Atualizar cost calculator
11. Deprecar ou atualizar dynamic pricing
12. Atualizar access enforcement

---

## Links de Teste (Após Implementação)

### Páginas Públicas
- http://localhost:3000/pricing - Pricing público (Hybrid model)
- http://localhost:3000/contact - Formulário de contato

### Páginas Autenticadas
- http://localhost:3000/app/marketplace - Marketplace principal
- http://localhost:3000/app/marketplace/governed-access - Governed Access
- http://localhost:3000/app/marketplace/request-access - Request Access Form (novo)
- http://localhost:3000/app/billing - Billing Dashboard
- http://localhost:3000/app/billing/usage - Usage Dashboard (novo)

### APIs
- GET /api/billing-report?tenant_id=X&month=YYYY-MM - Relatório de billing
- GET /.well-known/jwks.json - JWKS público
- POST /api/sidecar/token - Emissão de JWT

---

## Fluxos de Teste

### Fluxo 1: Usuário Público → Request Access
1. Acessa /pricing
2. Vê modelo Hybrid (base + uso)
3. Clica "Request Access"
4. Preenche formulário
5. Recebe confirmação

### Fluxo 2: Tenant → Billing Dashboard
1. Login como tenant
2. Acessa /app/billing
3. Vê uso atual (DICOM, FHIR, Audio, Text)
4. Vê projeção de fatura mensal
5. Baixa relatório CSV

### Fluxo 3: Admin → Emissão de JWT
1. Admin configura tenant
2. Emite JWT via /api/sidecar/token
3. JWT inclui quotas e features
4. Sidecar valida JWT
5. Enforcement de quotas (429 quando excedido)

---

**Última Atualização:** 2026-02-24
