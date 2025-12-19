# XASE HITL – Proposta Comercial Sales-Ready

Última atualização: 17/12/2025

Este documento traduz o estado técnico atual em uma proposta comercial clara, assinável e orientada a valor. Estruturado em 4 camadas: (1) Mensagem, (2) Garantias, (3) Integração percebida, (4) Riscos comerciais ocultos. Referências técnicas: `docs/SYSTEM_STATUS_HITL.md`, `src/lib/xase/human-intervention.ts`, `src/app/api/xase/v1/records/[id]/intervene/route.ts`, `src/app/api/records/[id]/intervene/route.ts`.

---

## 1) Mensagem (posicionamento e narrativa)

- **[Posicionamento]** XASE HITL não é um workflow de aprovação. É prova criptográfica e imutável de supervisão humana sobre decisões de IA.
- **[Proposta de valor em 30s]**
  - Reduza risco regulatório: registre quem aprovou/rejeitou/alterou, quando e por quê, de forma WORM.
  - Ganhe poder probatório: exporte evidências verificáveis para auditorias e disputas.
  - Integre sem fricção: APIs REST simples e UI pronta para times de análise.
- **[História de 1 página (happy path)]**
  - Uma fintech aprova crédito com IA. Um analista faz override (motivo + novo resultado).
  - Seis meses depois, o cliente contesta. A XASE exporta o bundle com decisão da IA, intervenção humana, ator, justificativa e assinatura.
  - O jurídico encerra o caso com prova verificável.

---

## 2) O que garantimos (contrato de expectativa)

- **[Prova imutável]** Intervenções humanas são registradas em modelo WORM (Write Once, Read Many). Não há edição nem deleção de intervenções.
- **[Rastreabilidade completa]** Guardamos ator (nome, e-mail, papel), justificativa, IP, User-Agent e timestamp.
- **[Fonte da decisão final]** `finalDecisionSource` distingue se a decisão foi da IA ou derivada de uma intervenção humana (approve/reject/override).
- **[Trilha de auditoria]** Cada intervenção é ligada a `AuditLog` com status de sucesso/falha.
- **[Export forense]** Evidência é exportável. Inclusão explícita de intervenções no bundle está no roadmap imediato (ver cronograma abaixo).

### 2.1 Contrato de Imutabilidade (explícito)

- **Nunca editamos nem deletamos** intervenções existentes.
- **Correções geram novos registros**, preservando histórico completo.
- Campos derivados no `DecisionRecord` são atualizados como efeito colateral e também ficam auditáveis.

### 2.2 Mapeamento regulatório (resumo)

| Exigência | Como o XASE HITL atende |
|---|---|
| EU AI Act – Human oversight | Registro WORM de intervenção + ator + justificativa + timestamp |
| LGPD – Minimização | Bundles com opção hash-only e metadados; retenção/anonimização planejadas |
| SOC 2 – Audit Trail | `AuditLog` vinculado a cada intervenção + export para evidência |
| ISO 27001 – Accountability | `finalDecisionSource`, RBAC por papel e logs de acesso |
| Disputas jurídicas | Export verificável com assinatura cobrindo IA + HUMANO (roadmap imediato) |

Obs.: a tabela é um guia de mapeamento; não substitui parecer jurídico.

---

## 3) Integração percebida (o que o cliente vê que já funciona)

- **[Console/Admin]**
  - Página de detalhes do record (`src/components/xase/RecordDetails.tsx`) com seção “Human Interventions” e badge `finalDecisionSource`.
  - Modal de intervenção (`src/components/xase/InterventionDialog.tsx`) para APPROVED/REJECTED/OVERRIDE/ESCALATED.
- **[APIs REST]**
  - Pública (API Key): `POST/GET /api/xase/v1/records/{transactionId}/intervene`.
  - UI (sessão): `POST/GET /api/records/{transactionId}/intervene`.
  - Validações por ação (OVERRIDE exige `newOutcome`; REJECTED/OVERRIDE exigem `reason`).
- **[Segurança]**
  - RBAC na UI: POST permitido para OWNER/ADMIN/REVIEWER, GET para VIEWER+.
  - API Key com permissões; recomendação de permissão dedicada `intervene` (tecnicamente suportada em `hasPermission()`).

---

## 4) Riscos comerciais ocultos (e mitigação)

- **[Idempotência do POST]** Ainda não implementada. Mitigação: adicionar `Idempotency-Key` + dedupe (ETA 0,5 dia).
- **[Rate limit dedicado]** Não implementado. Mitigação: bucket por API Key para intervenções (ETA 0,5 dia).
- **[Filtros/paginação no GET]** Não implementados. Mitigação: filtros por ação/ator/período + paginação (ETA 0,5 dia).
- **[Export inclui intervenções]** Em roadmap imediato. Mitigação: incluir última intervenção em `decision.json` e `report.txt` (ETA 1 dia útil).
- **[Retenção/privacidade]** Redação/anonimização pós-N dias não implementada. Mitigação: job de anonimização (ETA 1 dia).

---

## SLA e Comportamento Operacional

- **Disponibilidade**: a camada HITL da XASE é projetada para alta disponibilidade. Intervenções são registradas de forma transacional.
- **Falhas**: em caso de falha no registro de intervenção, nenhuma intervenção parcial é persistida (fail-safe).
- **Recuperação**: falhas são registradas em `AuditLog` com evento `INTERVENTION_FAILED`.
- **SLA inicial (GA)**: 99,9% mensal para APIs HITL.

### Garantia de Ordenação Temporal

- Intervenções humanas são **sempre registradas após** a decisão original da IA.
- A ordenação temporal é garantida por:
  - timestamps imutáveis no ledger
  - encadeamento lógico por `transactionId` 
- Overrides nunca sobrescrevem decisões anteriores; geram novos registros encadeados.

Essa garantia permite comprovar, em auditoria, que a supervisão humana ocorreu posteriormente à decisão automatizada.

### Definição de Ator (Human Actor)

- Uma intervenção HITL representa a ação de um **ator humano autenticado**.
- O ator pode ser:
  - usuário autenticado via sessão (UI)
  - operador identificado via API Key com identidade explícita
- Intervenções automatizadas (bots/serviços) **não** são classificadas como HITL.

### Política de Falha (Fail-Safe)

- A XASE HITL adota política **fail-safe**:
  - se o registro da intervenção falhar, a intervenção é considerada não concluída
  - nenhum estado intermediário é persistido
- A decisão original permanece válida até que uma intervenção válida seja registrada.

## Unidade de Valor (Pricing-Aware)

A XASE HITL é dimensionada com base em:
- número de **decisões registradas**
- número de **intervenções humanas**
- volume de **evidências exportadas**

Essa granularidade permite alinhamento entre custo operacional e valor entregue.

---

## Promessas comerciais claras (frases para proposta)

- **Garantimos prova imutável de supervisão humana exigida por auditorias de IA e decisões automatizadas.**
- **Fornecemos trilha completa de quem interveio, quando, de onde e por qual motivo.**
- **Entregamos export de evidência verificável para auditorias e disputas (bundle com IA + HUMANO).**
- **Integração rápida via APIs REST e console administrativo pronto para uso.**

---

## Limites (escopo honesto)

- A XASE não substitui processos de decisão humana, governança de modelos ou explicabilidade algorítmica.
- A XASE prova que houve supervisão humana e registra o contexto; não julga se a decisão “foi correta”.

---

## Checklist para ficar 100% sales-ready

- **[Alta prioridade]**
  - **Seção de garantias** incluída nesta proposta.
  - **Tabela de mapeamento regulatório** incluída.
  - **Contrato explícito de imutabilidade** incluído.
  - **Frase de posicionamento** incluída.
- **[Média]**
  - Personas (Dev/Compliance/Produto) cobertas na narrativa.
  - Caso de uso narrativo completo incluído.
  - Promessa explícita de export HITL no bundle (com ETA) incluída.
- **[Baixa]**
  - Webhooks `intervention.created` com HMAC.
  - Filtros/paginação do GET.
  - Rate limit dedicado por API Key.

---

## Cronograma de fechamento (curto prazo)

- Dia 1: idempotência + rate limit dedicado + filtros/paginação.
- Dia 2: export inclui intervenções + webhooks + docs finais.
- Dia 3: testes de integração + E2E UI + revisão jurídica da proposta.

> Resultado: pacote enterprise assinável em até 3 dias úteis.

---

## Apêndice – Referências técnicas

- Core: `src/lib/xase/human-intervention.ts`
- APIs públicas: `src/app/api/xase/v1/records/[id]/intervene/route.ts`
- APIs UI: `src/app/api/records/[id]/intervene/route.ts`
- Auth/API Key: `src/lib/xase/auth.ts`
- UI: `src/components/xase/RecordDetails.tsx`, `src/components/xase/InterventionDialog.tsx`
- Status técnico: `docs/SYSTEM_STATUS_HITL.md`
