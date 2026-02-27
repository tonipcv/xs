# Frontend Testing Guide - Billing Hybrid System

## 📋 Resumo das Mudanças Implementadas

### ✅ Páginas Atualizadas

1. **`/pricing`** - Pricing público reescrito com modelo Hybrid
2. **`/app/marketplace/governed-access`** - Filtro de preço por hora removido
3. **`/app/marketplace/request-access`** - Nova página de lead capture
4. **`/app/billing/usage`** - Novo dashboard de uso detalhado

### ✅ Componentes Criados

1. **`BillingUsageChart`** - Visualização de uso por pipeline com quotas
2. **API `/api/leads/request-access`** - Endpoint para processar leads

### ✅ APIs Disponíveis

1. **`GET /.well-known/jwks.json`** - JWKS público
2. **`GET /api/test-jwt-flow`** - Teste de JWT
3. **`GET /api/billing-report`** - Relatório de billing (JSON/CSV)
4. **`POST /api/leads/request-access`** - Captura de leads
5. **`POST /api/jobs/collect-billing`** - Job de coleta de métricas

---

## 🔗 Links de Todas as Páginas

### Páginas Públicas (Sem Autenticação)

| Página | URL | Descrição | Status |
|--------|-----|-----------|--------|
| **Home** | `http://localhost:3000/` | Landing page | ✅ Existente |
| **Pricing** | `http://localhost:3000/pricing` | Pricing público (Hybrid model) | ✅ Atualizado |
| **Contact** | `http://localhost:3000/contact` | Formulário de contato | ✅ Existente |
| **Login** | `http://localhost:3000/login` | Login de usuários | ✅ Existente |
| **Register** | `http://localhost:3000/register` | Cadastro de usuários | ✅ Existente |

### Páginas Autenticadas (Requer Login)

#### Dashboard e Billing

| Página | URL | Descrição | Status |
|--------|-----|-----------|--------|
| **Dashboard** | `http://localhost:3000/app/dashboard` | Dashboard principal | ✅ Existente |
| **Billing** | `http://localhost:3000/app/billing` | Billing dashboard (ledger) | ✅ Existente |
| **Usage Dashboard** | `http://localhost:3000/app/billing/usage` | Dashboard de uso detalhado | ✅ Novo |

#### Marketplace

| Página | URL | Descrição | Status |
|--------|-----|-----------|--------|
| **Marketplace** | `http://localhost:3000/app/marketplace` | Marketplace principal | ✅ Existente |
| **Governed Access** | `http://localhost:3000/app/marketplace/governed-access` | Catálogo de acesso governado | ✅ Atualizado |
| **Request Access** | `http://localhost:3000/app/marketplace/request-access` | Formulário de lead capture | ✅ Novo |
| **Offer Details** | `http://localhost:3000/app/marketplace/[offerId]` | Detalhes de uma oferta | ✅ Existente |

#### Datasets

| Página | URL | Descrição | Status |
|--------|-----|-----------|--------|
| **Datasets** | `http://localhost:3000/app/datasets` | Lista de datasets | ✅ Existente |
| **Dataset Details** | `http://localhost:3000/app/datasets/[id]` | Detalhes de um dataset | ✅ Existente |
| **New Dataset** | `http://localhost:3000/app/datasets/new` | Criar novo dataset | ✅ Existente |

#### Outros

| Página | URL | Descrição | Status |
|--------|-----|-----------|--------|
| **Policies** | `http://localhost:3000/app/policies` | Políticas de acesso | ✅ Existente |
| **Leases** | `http://localhost:3000/app/leases` | Leases ativos | ✅ Existente |
| **Audit** | `http://localhost:3000/app/audit` | Audit logs | ✅ Existente |
| **Evidence** | `http://localhost:3000/app/evidence` | Evidence bundles | ✅ Existente |
| **Settings** | `http://localhost:3000/app/settings` | Configurações | ✅ Existente |

---

## 🧪 Fluxos de Teste Completos

### Fluxo 1: Usuário Público → Request Access

**Objetivo:** Testar jornada de lead capture desde pricing até submissão

**Passos:**
1. Acesse `http://localhost:3000/pricing`
2. Verifique que mostra:
   - 3 planos: Basic (R$ 15k), Professional (R$ 45k), Enterprise (Custom)
   - Pricing por unidade técnica (DICOM, FHIR, Audio, Text)
   - Exemplo de fatura mensal (Hospital São Lucas - R$ 84.600)
   - FAQ sobre modelo Hybrid
3. Clique em "Request Access" (qualquer plano)
4. Preencha o formulário:
   - Nome: "Dr. João Silva"
   - Email: "joao.silva@hospital.com"
   - Empresa: "Hospital São Lucas"
   - Role: "CIO / IT Director"
   - Data Type: "DICOM (Medical Imaging)"
   - Volume: "1M - 10M records/month"
   - Use Case: "AI Model Training"
5. Clique "Submit Request"
6. Verifique página de sucesso com:
   - Ícone de check verde
   - Mensagem "Request Submitted Successfully"
   - "What happens next?" (3 passos)
   - Botões: "Back to Pricing" e "Browse Marketplace"

**Resultado Esperado:**
- ✅ Formulário submetido com sucesso
- ✅ Lead registrado no audit log
- ✅ Console mostra: `[Lead] New request access: { name, email, company... }`

---

### Fluxo 2: Tenant → Billing Dashboard

**Objetivo:** Testar visualização de uso e projeção de fatura

**Passos:**
1. Faça login como tenant
2. Acesse `http://localhost:3000/app/billing`
3. Verifique tab "Dashboard" mostra:
   - Current Balance
   - Total Debits/Credits
   - Ledger Entries
4. Clique na tab "Ledger"
5. Verifique tabela de movimentações
6. Acesse `http://localhost:3000/app/billing/usage`
7. Verifique:
   - Estimated Invoice card (azul) com total projetado
   - 4 cards de uso: DICOM, FHIR, Audio, Data Processed
   - Barras de progresso com % de quota
   - Alertas se >80% ou >100%
   - Cards adicionais: Text Pages, PHI Redactions
   - Pricing Reference com rates atuais
8. Clique "Export CSV"
9. Verifique download de arquivo CSV com métricas

**Resultado Esperado:**
- ✅ Dashboard mostra uso atual (pode ser 0 se Sidecar não processou dados)
- ✅ Projeção de fatura calculada corretamente
- ✅ Barras de progresso funcionando
- ✅ CSV exportado com sucesso

---

### Fluxo 3: Marketplace → Sem Filtro de Preço

**Objetivo:** Verificar que filtro de preço por hora foi removido

**Passos:**
1. Faça login
2. Acesse `http://localhost:3000/app/marketplace/governed-access`
3. Verifique filtros disponíveis:
   - ✅ Risk Class (dropdown)
   - ❌ Max Price (per hour) - REMOVIDO
   - ✅ Apply Filters button
4. Verifique cards de ofertas:
   - ✅ Título, descrição, risk class, jurisdiction
   - ❌ Preço por hora - REMOVIDO
   - ✅ Botão "Request Access"
5. Clique em "Request Access" em qualquer card
6. Verifique redirecionamento para `/app/marketplace/request-access`

**Resultado Esperado:**
- ✅ Filtro de preço removido
- ✅ Cards sem exibição de preço
- ✅ CTA "Request Access" funcionando

---

### Fluxo 4: Admin → Billing Report API

**Objetivo:** Testar geração de relatório de billing via API

**Passos:**
1. Abra terminal
2. Teste JWKS:
   ```bash
   curl http://localhost:3000/.well-known/jwks.json | jq
   ```
3. Teste JWT flow:
   ```bash
   curl http://localhost:3000/api/test-jwt-flow | jq
   ```
4. Teste billing report (JSON):
   ```bash
   curl "http://localhost:3000/api/billing-report?tenant_id=test_tenant&month=2026-02" | jq
   ```
5. Teste billing report (CSV):
   ```bash
   curl "http://localhost:3000/api/billing-report?tenant_id=test_tenant&month=2026-02&format=csv" -o billing.csv
   cat billing.csv
   ```
6. Teste job de coleta (sem auth - deve dar 401):
   ```bash
   curl -X POST http://localhost:3000/api/jobs/collect-billing
   ```

**Resultado Esperado:**
- ✅ JWKS retorna chave pública com kid e alg=RS256
- ✅ JWT flow retorna success=true
- ✅ Billing report JSON retorna estrutura completa
- ✅ Billing report CSV retorna arquivo formatado
- ✅ Job sem auth retorna 401

---

### Fluxo 5: Sidecar → Métricas Enriquecidas

**Objetivo:** Verificar que Sidecar expõe billing_counters no /ready

**Passos:**
1. Acesse Sidecar /ready:
   ```bash
   curl https://aa-xase-sidecar.dpbdp1.easypanel.host/ready | jq
   ```
2. Verifique campos:
   - `ready: true`
   - `version: "0.1.0"`
   - `ingestion_mode: "s3"`
   - `data_pipeline: "dicom"`
   - `features: { dicom_ocr, fhir_nlp, audio_redaction, prefetch }`
   - `billing_counters: { dicom_images, fhir_resources, audio_minutes, text_pages, bytes_total, redactions_total }`
3. Se `billing_counters` não estiver presente:
   - ⚠️ Sidecar ainda não foi atualizado com a nova build
   - Billing report usará valores 0 (safe defaults)

**Resultado Esperado:**
- ✅ Sidecar responde com ready=true
- ⚠️ billing_counters pode não estar presente (build antiga)
- ✅ Sistema funciona mesmo sem billing_counters (usa defaults)

---

## 🎨 Checklist de Design e UX

### Pricing Page (`/pricing`)
- [ ] Hero section com título "Simple, Transparent Pricing"
- [ ] 3 cards de planos (Basic, Professional, Enterprise)
- [ ] Professional tem badge "Most Popular"
- [ ] Cada card mostra base mensal + usage pricing
- [ ] Exemplo de fatura mensal (Hospital São Lucas)
- [ ] FAQ com 5 perguntas
- [ ] CTA section com gradiente preto
- [ ] Botões "Request Access" e "Contact Sales"

### Request Access (`/app/marketplace/request-access`)
- [ ] Breadcrumb "Back to Pricing"
- [ ] Formulário com 2 seções: Contact Info + Requirements
- [ ] Campos obrigatórios marcados com *
- [ ] Dropdowns para Role, Data Type, Volume, Use Case
- [ ] Botão "Submit Request" desabilitado se campos obrigatórios vazios
- [ ] Página de sucesso com ícone verde e "What happens next?"
- [ ] Trust indicators no footer (24-48h, 99.7%, SOC 2)

### Usage Dashboard (`/app/billing/usage`)
- [ ] Header com título "Usage Dashboard" e período atual
- [ ] Botões "Export CSV" e "View Ledger"
- [ ] Card azul com "Estimated Invoice" e total projetado
- [ ] 5 mini-cards com breakdown (Base, DICOM, FHIR, Audio, Text)
- [ ] 4 cards de métricas com barras de progresso
- [ ] Alertas visuais quando >80% ou >100% quota
- [ ] 2 cards adicionais (Text Pages, PHI Redactions)
- [ ] Pricing Reference card com rates atuais
- [ ] Help section com 3 itens (Upgrade, Billing Cycle, Quota Alerts)

### Marketplace Governed Access (`/app/marketplace/governed-access`)
- [ ] Filtros simplificados (apenas Risk Class)
- [ ] Grid de cards sem exibição de preço
- [ ] Botão "Request Access" em cada card

---

## 🐛 Troubleshooting

### Erro: "Property 'billingSnapshot' does not exist"
**Causa:** Prisma client não regenerado após migration  
**Fix:** `npm run billing:migrate`

### Erro: Billing report retorna 0 para todos contadores
**Causa:** Sidecar não expõe billing_counters ainda (build antiga)  
**Fix:** Normal. Sistema usa safe defaults. Atualizar Sidecar para ver contadores reais.

### Erro: Request Access não submete
**Causa:** Endpoint `/api/leads/request-access` não encontrado  
**Fix:** Verificar que arquivo existe e servidor foi reiniciado

### Erro: Usage Dashboard mostra "No Sidecar Data Available"
**Causa:** `SIDECAR_URL_<TENANT_ID>` não configurado ou Sidecar offline  
**Fix:** Configurar env var ou verificar conectividade

### Erro: CSV export retorna 404
**Causa:** Link incorreto ou tenant_id inválido  
**Fix:** Verificar URL: `/api/billing-report?tenant_id=X&month=YYYY-MM&format=csv`

---

## 📊 Métricas de Sucesso

### Técnicas
- ✅ Todas as páginas carregam sem erro 404
- ✅ Formulários submetem com sucesso
- ✅ APIs retornam status 200 (ou 401 quando esperado)
- ✅ CSV exporta corretamente
- ✅ Billing report calcula charges corretamente

### UX
- ✅ Pricing page clara e transparente
- ✅ Request Access form intuitivo (5 min para preencher)
- ✅ Usage Dashboard mostra métricas em tempo real
- ✅ Alertas de quota visíveis e acionáveis
- ✅ Navegação fluida entre páginas

### Negócio
- ✅ Lead capture funcionando (audit log registra)
- ✅ Pricing Hybrid comunicado claramente
- ✅ Self-service billing disponível
- ✅ Transparência total de custos

---

## 🚀 Próximos Passos (Backlog)

### P1 (Alta Prioridade)
- [ ] Integrar lead capture com CRM (HubSpot/Salesforce)
- [ ] Enviar email de confirmação após Request Access
- [ ] Adicionar alertas automáticos de quota (80%, 100%)
- [ ] Implementar enforcement de quota no Sidecar (429)

### P2 (Média Prioridade)
- [ ] Dashboard de billing com gráficos históricos (últimos 12 meses)
- [ ] Exportar relatório PDF além de CSV
- [ ] Configurar Vercel Cron para coleta diária
- [ ] Adicionar filtros de período no Usage Dashboard

### P3 (Baixa Prioridade)
- [ ] Atualizar Access Plan Wizard para modelo Hybrid
- [ ] Deprecar ou atualizar dynamic pricing
- [ ] Atualizar cost calculator para unidades técnicas
- [ ] Criar página de pricing comparison (Basic vs Pro vs Enterprise)

---

## 📞 Suporte

- **Documentação Completa:** `/docs/BILLING_HYBRID_SYSTEM.md`
- **Quick Start:** `/docs/BILLING_SETUP_QUICKSTART.md`
- **Audit Frontend:** `/docs/FRONTEND_AUDIT_BILLING.md`
- **Testing Guide:** `/docs/FRONTEND_TESTING_GUIDE.md` (este arquivo)

---

**Última Atualização:** 2026-02-24  
**Versão:** 1.0  
**Status:** ✅ Pronto para testes
