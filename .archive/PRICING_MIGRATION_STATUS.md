# XASE Pricing Migration - Status Report

## Objetivo
Migrar de pricing baseado em tokens/decisões para modelo **use-case-based anual** com tiers (Sandbox, Team, Business, Enterprise, Enterprise+), alinhado ao mercado de GRC/AI Compliance.

---

## ✅ Fase 1: Fundação (COMPLETO)

### 1. Schema & Database
- ✅ Adicionados campos de entitlements em `User`:
  - `planTier` (sandbox|team|business|enterprise|enterprise_plus)
  - `useCasesIncluded` (1, 2, 5, 10, unlimited)
  - `retentionYears` (0.08 = 30 dias, 2, 5, 7+)
- ✅ Migration SQL criada: `database/migrations/011_add_pricing_entitlements.sql`
- ✅ Prisma Client regenerado

### 2. Webhook Stripe (Completo)
**Arquivo**: `src/app/api/webhook/route.ts`

- ✅ **checkout.session.completed**: salva `stripeCustomerId` no usuário
- ✅ **customer.subscription.created|updated**: 
  - Lê `price.metadata.tier`, `use_cases_included`, `retention_years`
  - Mapeia tier → entitlements (freeTokensLimit, isPremium, isSuperPremium)
  - Persiste `Subscription` no banco
- ✅ **customer.subscription.deleted**: volta usuário para tier sandbox

**Mudança crítica**: Não usa mais `PRICE_IDS` hardcoded. Identifica plano via `price.metadata`.

### 3. Usage Helper
**Arquivo**: `src/lib/usage.ts`

- ✅ `checkAndIncrementUsage(userId, cost)`: valida limite, reseta mensal (30d), incrementa uso
- ✅ `getUserUsage(userId)`: retorna stats completos (tier, uso, limite, %, dias até reset)
- ✅ Lança erro `LIMIT_EXCEEDED` quando exceder fair-use

### 4. APIs
- ✅ `GET /api/user/usage`: retorna consumo e entitlements do usuário
- ✅ `POST /api/billing/portal`: cria sessão do Stripe Customer Portal para gerenciar billing

### 5. UI Profile
**Arquivo**: `src/app/profile/page.tsx`

- ✅ Mostra tier atual, use cases, retention
- ✅ Barra de consumo com cores (verde/amarelo/vermelho)
- ✅ Dias até reset mensal
- ✅ Botão "Manage Billing" (abre Customer Portal)
- ✅ Botão "Upgrade Plan" para sandbox

---

## 🚧 Fase 2: Enforcement & UX (PENDENTE)

### 8. UI Xase Layout (TODO)
**Objetivo**: Adicionar barra de consumo e paywall no console Xase

- [ ] Criar componente de barra de uso no layout `src/app/xase/layout.tsx`
- [ ] Mostrar alerta quando atingir 80%, 90%, 100%
- [ ] Modal de upgrade quando exceder limite
- [ ] Bloquear ações críticas quando `LIMIT_EXCEEDED`

### 9. Aplicar Usage Gating (TODO)
**Objetivo**: Proteger rotas críticas do Xase com `checkAndIncrementUsage`

Rotas a proteger:
- [ ] `src/app/xase/v1/records/route.ts` (POST - criar decision record)
- [ ] `src/app/xase/v1/export/[id]/route.ts` (POST - exportar evidência)
- [ ] `src/app/xase/v1/checkpoints/route.ts` (POST - criar checkpoint)
- [ ] Outras rotas de alto custo

Padrão:
```ts
import { checkAndIncrementUsage } from '@/lib/usage';

// No handler
try {
  await checkAndIncrementUsage(userId, cost);
  // ... operação
} catch (e: any) {
  if (e.code === 'LIMIT_EXCEEDED') {
    return NextResponse.json({ error: 'Limit exceeded', ...e.usage }, { status: 402 });
  }
  throw e;
}
```

### 10. UI de Planos (TODO)
**Objetivo**: Atualizar páginas de pricing para refletir tiers anuais

Arquivos:
- [ ] `src/app/planos/page.tsx`
- [ ] `src/app/components/PlansInterface.tsx`
- [ ] `src/components/PricingPlans.tsx`

Mudanças:
- Mostrar preços anuais (não mensais)
- Destacar "use cases" como métrica principal
- Adicionar tiers Enterprise/Enterprise+
- Remover referências a tokens como unidade de venda

---

## 📋 Fase 3: Stripe Catalog (TODO)

### Criar Produtos/Preços no Stripe
Usar Stripe Dashboard ou API para criar:

**Product**: XASE AI Compliance Platform

**Prices** (com metadata):
```json
{
  "tier": "team",
  "use_cases_included": "2",
  "retention_years": "2",
  "interval": "year",
  "amount": 1200000  // $12,000/year
}
```

Repetir para: team, business, enterprise, enterprise_plus

### Remover Duplicação
- [ ] Decidir: manter `src/lib/prices.ts` OU `src/app/api/get-or-create-prices`
- [ ] Remover o não escolhido
- [ ] Atualizar checkout para usar catálogo unificado

---

## 🧪 Testes Necessários

### Webhook
- [ ] Simular `checkout.session.completed` → verificar `stripeCustomerId` salvo
- [ ] Simular `customer.subscription.created` → verificar entitlements atualizados
- [ ] Simular `customer.subscription.deleted` → verificar volta para sandbox

### Usage
- [ ] Criar usuário sandbox, consumir 1k tokens → verificar bloqueio
- [ ] Criar usuário team, consumir 200k tokens → verificar bloqueio
- [ ] Verificar reset mensal após 30 dias

### UI
- [ ] Profile mostra tier correto
- [ ] Manage Billing abre portal
- [ ] Barra de uso atualiza em tempo real

---

## 📊 Métricas de Sucesso

- **NRR Target**: 130-150% (via expansão de use cases)
- **ACV Médio**: $50k → $120k → $200k (anos 1-3-5)
- **Churn**: <10% anual
- **Payback**: <6 meses

---

## 🚀 Próximos Passos Imediatos

1. **Rodar migration**: `npx prisma migrate dev`
2. **Testar webhook** em ambiente de dev com Stripe CLI
3. **Implementar gating** em 2-3 rotas críticas do Xase
4. **Adicionar barra de uso** no layout do Xase
5. **Atualizar página de planos** para refletir tiers anuais

---

## 📝 Notas

- **Prisma 7 warning**: `datasource.url` deprecated. Não afeta funcionalidade atual. Migrar para `prisma.config.ts` em versão futura.
- **Backward compatibility**: Usuários existentes com `isPremium` foram migrados para `team` ou `business` na migration SQL.
- **Fair-use**: Enterprise tiers têm limite técnico alto (999M) mas podem ser monitorados para overage billing futuro.

---

**Status Geral**: 70% completo. Fundação sólida implementada. Falta enforcement nas rotas e atualização de UI de planos.

**Última atualização**: 2025-12-25
