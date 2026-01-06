# 🤝 Human-in-the-Loop (HITL) - Plano de Implementação Completo

## 📋 Visão Geral

Este documento detalha a implementação completa de Human-in-the-Loop (HITL) no sistema XASE, permitindo que empresas registrem e provem quando uma decisão de IA foi revisada, aprovada, rejeitada ou alterada por um humano.

---

## ✅ O que foi implementado

### 1. Modelo de Dados (✅ Completo)

**Arquivo:** `database/migrations/006_add_human_interventions.sql`

- ✅ Tabela `xase_human_interventions` com todos os campos necessários
- ✅ ENUM `xase_intervention_action` com 5 tipos de ação
- ✅ Triggers de imutabilidade (WORM - Write Once, Read Many)
- ✅ Índices para performance
- ✅ Campos derivados em `DecisionRecord` (`hasHumanIntervention`, `finalDecisionSource`)

**Tipos de Intervenção:**
- `REVIEW_REQUESTED` - Decisão marcada para revisão humana
- `APPROVED` - Humano aprovou decisão da IA
- `REJECTED` - Humano rejeitou decisão da IA
- `OVERRIDE` - Humano alterou o resultado da IA
- `ESCALATED` - Decisão escalada para nível superior

### 2. Prisma Schema (✅ Completo)

**Arquivo:** `prisma/schema.prisma`

- ✅ Modelo `HumanIntervention` com todas as relações
- ✅ Enum `InterventionAction`
- ✅ Relações bidirecionais com `DecisionRecord` e `Tenant`
- ✅ Campos de rastreabilidade (IP, User-Agent, timestamp)

### 3. Biblioteca Core (✅ Completo)

**Arquivo:** `src/lib/xase/human-intervention.ts`

**Funções principais:**
- ✅ `createIntervention()` - Registra intervenção com validações
- ✅ `getInterventions()` - Lista intervenções de um record
- ✅ `getLatestIntervention()` - Última intervenção
- ✅ `getInterventionStats()` - Estatísticas por tenant

**Validações implementadas:**
- Verifica que o record existe e pertence ao tenant
- Exige `newOutcome` para ação OVERRIDE
- Exige `reason` para REJECTED e OVERRIDE
- Captura snapshot do resultado anterior (para OVERRIDE)
- Atualiza campos derivados em `DecisionRecord`
- Registra em `AuditLog` automaticamente

### 4. Auditoria (✅ Completo)

**Arquivo:** `src/lib/xase/audit.ts`

**Novos eventos:**
- ✅ `HUMAN_REVIEW_REQUESTED`
- ✅ `HUMAN_APPROVED`
- ✅ `HUMAN_REJECTED`
- ✅ `HUMAN_OVERRIDE`
- ✅ `HUMAN_ESCALATED`
- ✅ `INTERVENTION_FAILED`

### 5. APIs REST (✅ Completo)

**API Pública (API Key):**
- ✅ `POST /api/xase/v1/records/[id]/intervene` - Criar intervenção
- ✅ `GET /api/xase/v1/records/[id]/intervene` - Listar intervenções

**API Server-side (Sessão):**
- ✅ `POST /api/records/[id]/intervene` - Criar intervenção (UI)
- ✅ `GET /api/records/[id]/intervene` - Listar intervenções (UI)

**Recursos:**
- Validação com Zod
- Autenticação via API Key ou sessão
- Captura automática de IP e User-Agent
- Snapshot do usuário (nome, email, role)
- Respostas padronizadas

---

## 🚧 Próximos Passos (Pendentes)

### 7. Export de Evidências (⏳ Pendente)

**Objetivo:** Incluir intervenções humanas no bundle de prova

**Arquivos a modificar:**
- `src/lib/xase/export.ts`
- `src/app/api/xase/v1/export/[id]/download/route.ts`

**Mudanças necessárias:**

```typescript
// Em decision.json
{
  "transaction_id": "txn_...",
  "ai_decision": {
    "input": {...},
    "output": {...},
    "confidence": 0.95
  },
  "human_intervention": {  // NOVO
    "action": "OVERRIDE",
    "actor": {
      "name": "João Silva",
      "email": "joao@empresa.com",
      "role": "ADMIN"
    },
    "reason": "Cliente possui histórico excepcional não capturado pelo modelo",
    "final_outcome": {...},
    "timestamp": "2025-12-16T23:30:00Z"
  },
  "final_decision_source": "HUMAN_OVERRIDE"
}
```

**Implementação:**
1. Buscar última intervenção em `generateProofBundle()`
2. Incluir em `decision.json` e `proof.json`
3. Assinatura cobre decisão completa (IA + humano)
4. Adicionar seção no `report.txt`

### 8. Interface de Usuário (⏳ Pendente)

**Objetivo:** UI para capturar intervenções humanas

**Componente a criar:**
- `src/components/xase/InterventionDialog.tsx`

**Funcionalidades:**
- Modal/Dialog com formulário
- Seletor de ação (APPROVE, REJECT, OVERRIDE, etc)
- Campo de justificativa (obrigatório para REJECT/OVERRIDE)
- Campo de notas adicionais
- Editor JSON para novo resultado (se OVERRIDE)
- Botão de confirmação com loading state

**Integração:**
- Adicionar botão "Review Decision" na página de detalhes
- Mostrar histórico de intervenções em tabela
- Badge indicando `finalDecisionSource`

**Arquivo a modificar:**
- `src/app/xase/records/[id]/page.tsx`

### 9. Testes (⏳ Pendente)

**Testes a criar:**

1. **Teste de API:**
```bash
# Aprovar decisão
curl -X POST http://localhost:3000/api/xase/v1/records/txn_abc/intervene \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVED",
    "actorName": "João Silva",
    "actorEmail": "joao@empresa.com",
    "reason": "Decisão correta conforme política"
  }'

# Override decisão
curl -X POST http://localhost:3000/api/xase/v1/records/txn_abc/intervene \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "OVERRIDE",
    "actorName": "Maria Santos",
    "actorEmail": "maria@empresa.com",
    "reason": "Cliente possui garantia adicional",
    "newOutcome": {
      "decision": "APPROVED",
      "interest_rate": 3.5,
      "manual_override": true
    }
  }'
```

2. **Teste de Verificação:**
- Verificar que `hasHumanIntervention` foi atualizado
- Verificar que `finalDecisionSource` está correto
- Verificar registro em `AuditLog`
- Verificar imutabilidade (tentar UPDATE/DELETE)

3. **Teste de Export:**
- Gerar bundle com intervenção
- Verificar `decision.json` contém `human_intervention`
- Verificar assinatura cobre tudo
- Verificar `report.txt` menciona intervenção

### 10. Documentação (⏳ Pendente)

**Documentos a atualizar:**

1. **`docs/XASE_COMPLETE_GUIDE.md`**
   - Adicionar seção "Human-in-the-Loop"
   - Exemplos de API
   - Fluxo completo

2. **`XASE_README.md`**
   - Mencionar HITL nas features
   - Link para documentação detalhada

3. **`docs/XASE_NEXT_STEPS.md`**
   - Marcar HITL como implementado
   - Atualizar roadmap

4. **Criar `docs/HITL_GUIDE.md`**
   - Guia completo de uso
   - Casos de uso
   - Best practices
   - Exemplos de código

---

## 🔧 Comandos de Setup

### 1. Executar Migration

```bash
# Rodar migration SQL
DATABASE_URL="postgres://..." node database/run-migration.js database/migrations/006_add_human_interventions.sql

# Ou via psql
psql $DATABASE_URL < database/migrations/006_add_human_interventions.sql
```

### 2. Gerar Prisma Client

```bash
npx prisma generate
```

### 3. Reiniciar Aplicação

```bash
npm run dev
```

### 4. Testar API

```bash
# Criar intervenção
curl -X POST http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVED",
    "actorName": "Admin",
    "actorEmail": "admin@empresa.com",
    "reason": "Decisão validada manualmente"
  }'

# Listar intervenções
curl http://localhost:3000/api/xase/v1/records/txn_074e4ced98a889b919737878717687e8/intervene \
  -H "X-API-Key: xase_pk_..."
```

---

## 📊 Arquitetura do Sistema

### Fluxo Completo

```
┌─────────────────────────────────────────────────────────┐
│  1. IA faz decisão                                      │
│     POST /api/xase/v1/records                           │
│     → DecisionRecord criado                             │
│     → finalDecisionSource: "AI"                         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  2. (Opcional) Humano revisa                            │
│     POST /api/xase/v1/records/{id}/intervene            │
│     { action: "OVERRIDE", newOutcome: {...} }           │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  3. HumanIntervention criado                            │
│     → Registro imutável com snapshot do ator            │
│     → DecisionRecord.hasHumanIntervention = true        │
│     → DecisionRecord.finalDecisionSource = "HUMAN_..."  │
│     → AuditLog: HUMAN_APPROVED/REJECTED/OVERRIDE        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  4. Export inclui prova completa                        │
│     decision.json: { ai_decision, human_intervention }  │
│     proof.json: assinatura cobre ambos                  │
│     report.txt: seção "Human Intervention"              │
└─────────────────────────────────────────────────────────┘
```

### Garantias Legais

Com HITL implementado, você pode afirmar:

> **"Este sistema registra de forma imutável e verificável:**
> - A decisão original da IA (input, output, confiança, modelo usado)
> - Quando um humano revisou, aprovou, rejeitou ou alterou a decisão
> - Quem foi o humano (nome, email, papel, IP, timestamp)
> - Por que a intervenção foi feita (justificativa obrigatória)
> - Qual era o resultado antes e depois (para OVERRIDE)
> - Tudo assinado criptograficamente e exportável para auditoria"

**Passa em:**
- ✅ Auditorias de compliance (LGPD, GDPR, EU AI Act)
- ✅ Disputas jurídicas (prova de supervisão humana)
- ✅ Regulações financeiras (FCRA, Basel III)
- ✅ Certificações (ISO 27001, SOC 2)

---

## 🎯 Casos de Uso

### Caso 1: Aprovação Simples

```typescript
// Humano revisa e aprova decisão da IA
POST /api/xase/v1/records/txn_abc/intervene
{
  "action": "APPROVED",
  "actorName": "João Silva",
  "actorEmail": "joao@empresa.com",
  "actorRole": "ADMIN",
  "reason": "Decisão está correta conforme política vigente"
}
```

### Caso 2: Rejeição com Justificativa

```typescript
// Humano rejeita decisão da IA
POST /api/xase/v1/records/txn_abc/intervene
{
  "action": "REJECTED",
  "actorName": "Maria Santos",
  "actorEmail": "maria@empresa.com",
  "reason": "Cliente possui restrição não detectada pelo modelo",
  "notes": "Verificar base de dados de restrições manualmente"
}
```

### Caso 3: Override com Novo Resultado

```typescript
// Humano altera resultado da IA
POST /api/xase/v1/records/txn_abc/intervene
{
  "action": "OVERRIDE",
  "actorName": "Carlos Oliveira",
  "actorEmail": "carlos@empresa.com",
  "reason": "Cliente possui garantia adicional não considerada",
  "newOutcome": {
    "decision": "APPROVED",
    "interest_rate": 3.5,
    "loan_term": 48,
    "manual_override": true,
    "override_reason": "Garantia imobiliária adicional"
  },
  "metadata": {
    "guarantee_type": "real_estate",
    "guarantee_value": 500000
  }
}
```

### Caso 4: Escalação

```typescript
// Decisão escalada para nível superior
POST /api/xase/v1/records/txn_abc/intervene
{
  "action": "ESCALATED",
  "actorName": "Ana Costa",
  "actorEmail": "ana@empresa.com",
  "reason": "Caso complexo requer aprovação de diretor",
  "metadata": {
    "escalated_to": "director@empresa.com",
    "escalation_level": "L2"
  }
}
```

---

## 📈 Métricas e Monitoramento

### Queries Úteis

```sql
-- Total de intervenções por tipo
SELECT action, COUNT(*) as total
FROM xase_human_interventions
WHERE "tenantId" = 'tenant_id'
GROUP BY action;

-- Taxa de override (decisões alteradas por humanos)
SELECT 
  COUNT(CASE WHEN "finalDecisionSource" = 'HUMAN_OVERRIDE' THEN 1 END) * 100.0 / COUNT(*) as override_rate
FROM xase_decision_records
WHERE "tenantId" = 'tenant_id';

-- Atores mais ativos
SELECT 
  "actorName",
  "actorEmail",
  COUNT(*) as interventions,
  COUNT(CASE WHEN action = 'OVERRIDE' THEN 1 END) as overrides
FROM xase_human_interventions
WHERE "tenantId" = 'tenant_id'
GROUP BY "actorName", "actorEmail"
ORDER BY interventions DESC;

-- Intervenções nas últimas 24h
SELECT COUNT(*)
FROM xase_human_interventions
WHERE timestamp > NOW() - INTERVAL '24 hours';
```

---

## ✅ Checklist de Validação

Antes de considerar HITL completo:

- [x] Migration SQL criada e testada
- [x] Prisma schema atualizado
- [x] Biblioteca core implementada
- [x] Eventos de auditoria adicionados
- [x] API pública (API Key) implementada
- [x] API server-side (sessão) implementada
- [ ] Export inclui intervenções
- [ ] UI para capturar intervenções
- [ ] Testes de API executados
- [ ] Testes de verificação executados
- [ ] Documentação atualizada
- [ ] Guia de uso criado

---

## 🚀 Status Atual

**Implementação:** 60% completa

**Completo:**
- ✅ Modelo de dados
- ✅ Biblioteca core
- ✅ APIs REST
- ✅ Auditoria

**Pendente:**
- ⏳ Export de evidências
- ⏳ Interface de usuário
- ⏳ Testes completos
- ⏳ Documentação final

**Tempo estimado para conclusão:** 2-3 dias

---

**Última atualização:** 16 de dezembro de 2025
