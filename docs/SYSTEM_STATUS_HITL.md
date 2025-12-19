# XASE HITL – System Status & Sales-Ready Capabilities

Última atualização: 17/12/2025

## Visão geral

O sistema XASE implementa Human-in-the-Loop (HITL) end-to-end: modelo de dados imutável, biblioteca core, APIs públicas (API Key) e APIs server-side (sessão), auditoria e UI integrada (RecordDetails + InterventionDialog). Abaixo um retrato fiel do que já funciona, o que falta e o que podemos prometer comercialmente.

---

## Capacidades prontas (o que já funciona)

- **[Modelo de dados HITL]**
  - Tabela `xase_human_interventions` com imutabilidade WORM e índices.
  - Campos derivados em `xase_decision_records`: `hasHumanIntervention`, `finalDecisionSource`.
  - Migrações: `006`, `007`, `008`, `009` aplicadas.
  - Fonte: `database/migrations/006_*.sql` … `009_relax_immutability_allow_hitl.sql`.

- **[Core de negócios HITL]**
  - `createIntervention()`, `getInterventions()`, `getLatestIntervention()`, `getInterventionStats()`.
  - Validações específicas por ação (OVERRIDE exige `newOutcome`; REJECTED/OVERRIDE exigem `reason`).
  - Atualiza derivados no `DecisionRecord` e registra em `AuditLog`.
  - Fonte: `src/lib/xase/human-intervention.ts`.

- **[Auditoria]**
  - Eventos: `HUMAN_REVIEW_REQUESTED`, `HUMAN_APPROVED`, `HUMAN_REJECTED`, `HUMAN_OVERRIDE`, `HUMAN_ESCALATED`, `INTERVENTION_FAILED`.
  - Contexto: IP, User-Agent, ator (nome, e-mail, papel).
  - Fonte: `src/lib/xase/audit.ts`.

- **[APIs públicas (API Key)]**
  - `POST /api/xase/v1/records/[id]/intervene` → cria intervenção.
  - `GET  /api/xase/v1/records/[id]/intervene` → lista intervenções.
  - Validação Zod, retorno padronizado, autenticação por API Key (com `hasPermission`).
  - Fonte: `src/app/api/xase/v1/records/[id]/intervene/route.ts`, `src/lib/xase/auth.ts`.

- **[APIs UI (sessão)]**
  - `POST /api/records/[id]/intervene` (cria via UI com sessão Next-Auth).
  - `GET  /api/records/[id]/intervene` (lista via UI com sessão Next-Auth).
  - RBAC aplicado: POST permitido para `OWNER|ADMIN|REVIEWER`; GET para `VIEWER+`.
  - Fonte: `src/app/api/records/[id]/intervene/route.ts`.

- **[UI integrada]**
  - `RecordDetails.tsx`: seção “Human Interventions” (lista), badge `finalDecisionSource`.
  - `InterventionDialog.tsx`: modal para aprovar, rejeitar, override, escalar.
  - Fluxo: abre modal → valida → POST → recarrega lista e atualiza `finalDecisionSource`.
  - Fontes: `src/components/xase/RecordDetails.tsx`, `src/components/xase/InterventionDialog.tsx`.

---

## O que falta (priorizado)

- **[RBAC por API Key dedicado] (médio)**
  - Hoje a API pública usa `hasPermission(auth, 'ingest')`. Sugerido separar `'intervene'`.
  - Apoiado por `hasPermission()` já atualizado para aceitar `'intervene'`.

- **[Idempotência no POST /intervene] (médio)**
  - Adicionar suporte a `Idempotency-Key` e dedupe por `(transactionId, action, actorEmail, reason)`.

- **[Rate limit específico] (baixo)**
  - Bucket dedicado para ações de intervenção por API Key.

- **[GET com filtros e paginação] (baixo)**
  - Filtros: `action`, `actorEmail`, período; paginação `page/limit`.

- **[Webhooks de evento] (baixo)**
  - Emitir `intervention.created` com HMAC, para integrações externas.

- **[Privacidade/retention] (baixo)**
  - Redação/anonimização de metadados do ator após N dias (LGPD/GDPR).

- **[Testes automatizados] (alto)**
  - Integração (Prisma DB) cobrindo sucesso/falhas, idempotência e trigger de imutabilidade.
  - E2E UI (abrir modal, submeter, ver na lista, atualizar badge).

- **[Docs finais] (médio)**
  - Guia de API com exemplos por ação e códigos de erro.
  - Guia de UI com screenshots e fluxo.

---

## O que podemos prometer (Sales-Ready)

- **Prova de supervisão humana imutável**
  - Registro WORM de intervenções: quem, quando, por quê, de onde (IP/UA).
  - Atualização de `finalDecisionSource` para distinguir decisão da IA vs. humana.

- **APIs prontas para integração**
  - Criar/listar intervenções por API Key com validação e auditoria.
  - APIs server-side com sessão para uso no console/admin.

- **UI de revisão humana**
  - Console administrativo para aprovar, rejeitar, fazer override ou escalar decisões.
  - Histórico por transação e indicadores visuais do estado final.

- **Conformidade e rastreabilidade**
  - Trilhas de auditoria completas; campos derivados facilitam queries e relatórios.
  - Base sólida para compliance (LGPD/GDPR/EU AI Act/SOC2/ISO 27001).

- **Evolução rápida garantida**
  - Roadmap claro para idempotência, rate limit, filtros/paginação e webhooks.

Obs.: Export de evidências já suporta bundles; incluir intervenção no bundle é planejado e rápido (escopo fechado, esforço 2–3h).

---

## Endpoints principais

- `POST /api/xase/v1/records/{transactionId}/intervene`
- `GET  /api/xase/v1/records/{transactionId}/intervene`
- `POST /api/records/{transactionId}/intervene` (UI)
- `GET  /api/records/{transactionId}/intervene` (UI)

Validações por ação (core):
- OVERRIDE → exige `newOutcome` (JSON)
- REJECTED e OVERRIDE → exigem `reason`

---

## RBAC

- **Sessão (UI):**
  - POST: `OWNER|ADMIN|REVIEWER`
  - GET: `VIEWER+`
- **API Key (pública):**
  - Atual: permissões baseadas em `ingest`.
  - Sugerido: usar permissão dedicada `intervene` (já suportada em `hasPermission()`).

---

## Limitações conhecidas

- Idempotência do POST ainda não implementada.
- Rate limit específico para intervenções ainda não implementado.
- GET sem filtros/paginação.
- Webhooks e política de retenção/anonimização pendentes.

---

## Roadmap sugerido (curto prazo)

1) RBAC por API Key dedicado a `intervene` (0.5d)
2) Idempotência + rate limit (1d)
3) Filtros/paginação no GET (0.5d)
4) Webhooks + docs finais (1d)
5) Testes integração + E2E UI (1–1.5d)

---

## Referências de código

- Core: `src/lib/xase/human-intervention.ts`
- APIs públicas: `src/app/api/xase/v1/records/[id]/intervene/route.ts`
- APIs UI: `src/app/api/records/[id]/intervene/route.ts`
- Auth/API Key: `src/lib/xase/auth.ts`
- UI: `src/components/xase/RecordDetails.tsx`, `src/components/xase/InterventionDialog.tsx`
- Migrações: `database/migrations/006_*` a `009_*`
- Planos/Docs: `docs/HITL_IMPLEMENTATION_PLAN.md`, `docs/HITL_COMPLETE_PLAN.md`, `HITL_IMPLEMENTATION_SUMMARY.md`
