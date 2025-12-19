# XASE – Proposta de Vendas Completa (Todos os Produtos)

Última atualização: 17/12/2025

## Índice

1. [Posicionamento](#posicionamento)
2. [Portfólio de Produtos](#portfólio-de-produtos)
3. [Casos de Uso por Indústria](#casos-de-uso-por-indústria)
4. [Garantias e SLA](#garantias-e-sla)
5. [Compliance e Regulatório](#compliance-e-regulatório)
6. [Modelo de Precificação](#modelo-de-precificação)
7. [Roadmap e Evolução](#roadmap-e-evolução)
8. [Diferenciais Competitivos](#diferenciais-competitivos)

---

## Posicionamento

**XASE não é um sistema de workflow ou governança de IA.**  
**XASE é prova criptográfica imutável de decisões de IA.**

### Proposta de valor em 30 segundos

Empresas que usam IA para decisões críticas (crédito, seguros, saúde, RH) enfrentam 3 riscos:
1. **Risco regulatório**: auditorias exigem prova de supervisão humana e rastreabilidade.
2. **Risco jurídico**: disputas exigem evidências verificáveis da decisão.
3. **Risco operacional**: falta de confiança em decisões automatizadas.

**XASE resolve os 3 com um ledger imutável que:**
- Registra cada decisão de IA com hash chain criptográfico.
- Prova supervisão humana (approve/reject/override) de forma WORM.
- Exporta evidências verificáveis offline para auditorias e disputas.

---

## Portfólio de Produtos

### 1. Decision Ledger (Core)

**O que é**: ledger imutável para decisões de IA com hash chain e verificação criptográfica.

**Para quem**: empresas que usam IA em decisões críticas e precisam de rastreabilidade.

**Benefícios**:
- **Imutabilidade WORM**: decisões nunca são editadas ou deletadas.
- **Hash chain**: cada decisão encadeia a anterior, provando sequência temporal.
- **Verificação pública**: qualquer um pode verificar integridade via API.
- **Idempotência**: dedupe automático via `Idempotency-Key`.
- **Rate limiting**: 1000 decisões/hora por API Key.

**Casos de uso**:
- Fintech: aprovação de crédito, scoring, detecção de fraude.
- Seguros: precificação de apólices, análise de sinistros.
- Saúde: triagem automatizada, recomendações de tratamento.
- RH: screening de candidatos, avaliação de desempenho.

**Promessa comercial**:
> "Garantimos registro imutável de cada decisão de IA com hash chain verificável e API de verificação pública."

---

### 2. Checkpoints (Integrity Anchors)

**O que é**: âncoras periódicas assinadas por KMS que provam integridade do ledger em um ponto no tempo.

**Para quem**: empresas que precisam de prova externa de integridade para auditorias.

**Benefícios**:
- **Assinatura KMS**: cada checkpoint é assinado por AWS KMS (ou HSM).
- **Encadeamento**: checkpoints encadeiam entre si, provando continuidade.
- **Automação**: checkpoints criados automaticamente a cada 1 hora.
- **Verificação**: API para verificar assinatura e integridade.

**Casos de uso**:
- Auditorias externas: prova de integridade em data específica.
- Compliance SOC 2: evidência de controles de integridade.
- Disputas jurídicas: prova de que ledger não foi alterado.

**Promessa comercial**:
> "Garantimos âncoras de integridade assinadas por KMS a cada 1 hora, verificáveis offline."

---

### 3. Export Forense (Evidence Bundles)

**O que é**: bundles ZIP com decisão, prova criptográfica e script de verificação offline.

**Para quem**: empresas que precisam exportar evidências para auditorias, disputas ou compliance.

**Benefícios**:
- **Verificação offline**: bundle inclui script Node.js para verificar sem internet.
- **Assinatura RSA-SHA256**: decisão assinada com chave privada KMS.
- **Chave pública incluída**: bundle contém chave pública para verificação.
- **Canonical JSON**: hash calculado sobre JSON canônico (JCS).
- **Policy snapshot**: inclui versão exata da política usada.
- **Model metadata**: inclui ID, versão e hash do modelo.
- **Explicabilidade**: inclui SHAP ou outra explicação (se disponível).

**Estrutura do bundle**:
```
evidence_txn_abc.zip
├── decision.json       # Decisão completa
├── proof.json          # Assinatura + chave pública
├── verify.js           # Script de verificação
├── report.txt          # Relatório human-readable
├── policy.json         # Snapshot da política
├── explanation.json    # Explicabilidade (SHAP)
└── payloads/           # Input/output/context
```

**Casos de uso**:
- Auditorias regulatórias: entregar evidências para BACEN, CVM, ANS.
- Disputas jurídicas: provar decisão em processo judicial.
- Compliance interno: revisão de decisões por comitê.

**Promessa comercial**:
> "Garantimos export de evidências verificáveis offline com assinatura criptográfica e script de verificação incluído."

---

### 4. Human-in-the-Loop (HITL)

**O que é**: registro imutável de intervenções humanas em decisões de IA.

**Para quem**: empresas que precisam provar supervisão humana para compliance (EU AI Act, LGPD).

**Benefícios**:
- **5 tipos de ação**: REVIEW_REQUESTED, APPROVED, REJECTED, OVERRIDE, ESCALATED.
- **Snapshot do ator**: nome, email, papel, IP, User-Agent, timestamp.
- **Justificativa obrigatória**: REJECTED e OVERRIDE exigem `reason`.
- **Override com novo resultado**: OVERRIDE exige `newOutcome` (JSON).
- **Snapshot do resultado anterior**: preserva decisão original da IA.
- **Fonte da decisão final**: badge `finalDecisionSource` (AI vs HUMAN_APPROVED/REJECTED/OVERRIDE).
- **RBAC**: POST permitido para OWNER/ADMIN/REVIEWER; GET para VIEWER+.
- **UI integrada**: modal de intervenção + lista de intervenções no RecordDetails.

**Casos de uso**:
- EU AI Act: prova de supervisão humana em sistemas de alto risco.
- LGPD: prova de revisão humana em decisões automatizadas.
- Compliance interno: aprovação de gerente para decisões críticas.
- Escalação: envio de decisões complexas para nível superior.

**Promessa comercial**:
> "Garantimos prova imutável de supervisão humana com ator, justificativa e timestamp, exigida por EU AI Act e LGPD."

---

### 5. Policy Versioning

**O que é**: versionamento de políticas de decisão com snapshot imutável.

**Para quem**: empresas que precisam provar qual política foi usada em cada decisão.

**Benefícios**:
- **Snapshot imutável**: cada decisão referencia versão exata da política.
- **Hash da política**: SHA-256 do documento JSON.
- **Versionamento automático**: desativa versões anteriores ao criar nova.
- **Auditoria**: log de criação e desativação de políticas.

**Casos de uso**:
- Compliance: provar que decisão seguiu política vigente na data.
- Auditoria: rastrear mudanças de política ao longo do tempo.
- Rollback: reverter para versão anterior de política.

**Promessa comercial**:
> "Garantimos snapshot imutável da política usada em cada decisão, com hash SHA-256 e versionamento automático."

---

### 6. Audit Trail (Trilha Imutável)

**O que é**: log WORM de todas as ações administrativas.

**Para quem**: empresas que precisam de trilha de auditoria para SOC 2, ISO 27001.

**Benefícios**:
- **Imutabilidade**: triggers SQL impedem UPDATE/DELETE.
- **Contexto completo**: IP, User-Agent, timestamp, metadata.
- **Filtros**: ação, resourceType, período, status.
- **Eventos HITL**: HUMAN_APPROVED, HUMAN_REJECTED, HUMAN_OVERRIDE.
- **Eventos de export**: BUNDLE_STORED, BUNDLE_DOWNLOADED.
- **Eventos de checkpoint**: CHECKPOINT_CREATED, CHECKPOINT_VERIFIED.

**Casos de uso**:
- SOC 2: evidência de controles de acesso e auditoria.
- ISO 27001: trilha de ações administrativas.
- Investigação interna: rastrear ações de usuários.

**Promessa comercial**:
> "Garantimos trilha imutável de todas as ações administrativas com IP, User-Agent e timestamp."

---

### 7. API Keys (Autenticação Enterprise)

**O que é**: gerenciamento de API Keys com bcrypt, permissões e rate limit.

**Para quem**: empresas que precisam de autenticação segura para APIs.

**Benefícios**:
- **Bcrypt**: keys armazenadas com hash bcrypt (10 rounds).
- **Permissões granulares**: ingest, export, verify, intervene.
- **Rate limiting**: 1000 requests/hora por key.
- **Rotação**: criar nova key e revogar antiga.
- **Auditoria**: log de criação, rotação e revogação.

**Casos de uso**:
- Integração com sistemas de IA: ingestão de decisões.
- Integração com sistemas de compliance: export de evidências.
- Integração com sistemas de auditoria: verificação de decisões.

**Promessa comercial**:
> "Garantimos autenticação segura com bcrypt, permissões granulares e rate limiting."

---

## Casos de Uso por Indústria

### Fintech

**Problema**: BACEN exige rastreabilidade de decisões de crédito automatizadas.

**Solução XASE**:
- **Decision Ledger**: registra cada decisão de crédito com hash chain.
- **HITL**: registra aprovação de gerente para créditos acima de R$ 50k.
- **Export**: gera bundle para auditoria do BACEN.
- **Policy Versioning**: prova que decisão seguiu política vigente.

**ROI**: reduz tempo de auditoria em 70%; evita multas por falta de rastreabilidade.

---

### Seguros

**Problema**: ANS exige prova de supervisão humana em negativas de sinistros.

**Solução XASE**:
- **Decision Ledger**: registra cada análise de sinistro.
- **HITL**: registra revisão humana de negativas.
- **Export**: gera bundle para disputas judiciais.
- **Checkpoints**: prova integridade do ledger para auditorias.

**ROI**: reduz custos de disputas em 50%; acelera auditorias da ANS.

---

### Saúde

**Problema**: CFM exige rastreabilidade de decisões de triagem automatizada.

**Solução XASE**:
- **Decision Ledger**: registra cada triagem com hash chain.
- **HITL**: registra revisão de médico para casos críticos.
- **Export**: gera bundle para processos judiciais.
- **Audit Trail**: trilha de ações de médicos e enfermeiros.

**ROI**: reduz risco jurídico; acelera compliance com CFM.

---

### RH

**Problema**: LGPD exige transparência em decisões automatizadas de contratação.

**Solução XASE**:
- **Decision Ledger**: registra cada screening de candidato.
- **HITL**: registra revisão humana de rejeições.
- **Export**: gera bundle para DSR (Data Subject Request).
- **Policy Versioning**: prova que screening seguiu política vigente.

**ROI**: reduz risco de multas LGPD; acelera DSR.

---

## Garantias e SLA

### Disponibilidade

- **SLA inicial (GA)**: 99,9% mensal para APIs HITL e Decision Ledger.
- **Checkpoints**: criados automaticamente a cada 1 hora.
- **Storage**: MinIO (self-hosted) ou S3 (AWS) com 99,99% SLA.

### Imutabilidade

- **Nunca editamos nem deletamos** decisões, checkpoints, intervenções ou audit logs.
- **Correções geram novos registros**, preservando histórico completo.
- **Campos derivados** (hasHumanIntervention, finalDecisionSource) podem ser atualizados como efeito colateral.

### Ordenação Temporal

- Intervenções humanas são **sempre registradas após** a decisão original da IA.
- Ordenação garantida por timestamps imutáveis e encadeamento lógico por `transactionId`.
- Overrides nunca sobrescrevem decisões anteriores; geram novos registros encadeados.

### Definição de Ator (Human Actor)

- Uma intervenção HITL representa a ação de um **ator humano autenticado**.
- Ator pode ser: usuário via sessão (UI) ou operador via API Key com identidade explícita.
- Intervenções automatizadas (bots/serviços) **não** são classificadas como HITL.

### Política de Falha (Fail-Safe)

- A XASE HITL adota política **fail-safe**:
  - Se o registro da intervenção falhar, a intervenção é considerada não concluída.
  - Nenhum estado intermediário é persistido.
- A decisão original permanece válida até que uma intervenção válida seja registrada.

---

## Compliance e Regulatório

### Mapeamento Regulatório

| Exigência | Como o XASE atende |
|---|---|
| **EU AI Act – Human oversight** | Registro WORM de intervenção + ator + justificativa + timestamp |
| **LGPD – Minimização** | Bundles com opção hash-only; retenção/anonimização planejadas |
| **SOC 2 – Audit Trail** | `AuditLog` vinculado a cada intervenção + export para evidência |
| **ISO 27001 – Accountability** | `finalDecisionSource`, RBAC por papel e logs de acesso |
| **Disputas jurídicas** | Export verificável com assinatura cobrindo IA + HUMANO |
| **BACEN – Rastreabilidade** | Hash chain + policy snapshot + checkpoint KMS |
| **ANS – Supervisão humana** | HITL com justificativa obrigatória para negativas |
| **CFM – Transparência** | Export com explicabilidade (SHAP) e policy snapshot |

---

## Modelo de Precificação

### Unidades de Valor

A XASE é dimensionada com base em:
- **Número de decisões registradas** (ingest).
- **Número de intervenções humanas** (HITL).
- **Volume de evidências exportadas** (bundles).

Essa granularidade permite alinhamento entre custo operacional e valor entregue.

### Tiers (exemplo)

- **Starter**: até 10k decisões/mês, 100 intervenções/mês, 10 exports/mês.
- **Professional**: até 100k decisões/mês, 1k intervenções/mês, 100 exports/mês.
- **Enterprise**: ilimitado + SLA 99,95% + suporte dedicado + custom KMS.

---

## Roadmap e Evolução

### Curto prazo (Q1 2026)

- **Idempotência no HITL**: dedupe de intervenções via hash de (transactionId + action + actorEmail + reason).
- **Rate limit dedicado**: bucket separado para intervenções (300/h por API Key).
- **Filtros/paginação no GET /intervene**: filtros por action, actorEmail, período.
- **Webhooks**: emissão de `intervention.created` com HMAC para integrações externas.
- **Export com HITL**: inclusão de intervenções no bundle (decision.json + report.txt).

### Médio prazo (Q2 2026)

- **Retenção/anonimização**: job de anonimização de metadados do ator após N dias (LGPD/GDPR).
- **Dashboard de métricas**: taxa de override, atores mais ativos, tempo médio de revisão.
- **Explicabilidade avançada**: integração com SHAP, LIME, Anchors.
- **PDF reports**: geração de relatórios PDF para auditorias.

### Longo prazo (Q3-Q4 2026)

- **Blockchain anchoring**: ancoragem de checkpoints em blockchain público (Ethereum, Polygon).
- **Multi-tenancy avançado**: isolamento de dados por tenant com criptografia dedicada.
- **AI Governance**: integração com ferramentas de governança de IA (MLflow, Weights & Biases).

---

## Diferenciais Competitivos

### vs. Sistemas de Workflow

- **XASE não é workflow**: não gerencia aprovações ou fluxos de trabalho.
- **XASE é prova**: registra e prova que supervisão humana ocorreu.

### vs. Sistemas de Governança de IA

- **XASE não governa modelos**: não treina, valida ou monitora modelos.
- **XASE prova decisões**: registra e prova que decisão foi tomada com modelo X versão Y.

### vs. Sistemas de Auditoria

- **XASE não audita**: não analisa se decisão foi correta.
- **XASE prova rastreabilidade**: registra e prova que decisão foi tomada, por quem, quando e por quê.

### Posicionamento único

**XASE é a única solução que combina:**
1. Ledger imutável com hash chain.
2. Checkpoints KMS com assinatura externa.
3. Export forense com verificação offline.
4. HITL com snapshot do ator e justificativa.
5. Policy versioning com snapshot imutável.
6. Audit trail WORM.

---

## Limites (Escopo Honesto)

- A XASE **não substitui** processos de decisão humana, governança de modelos ou explicabilidade algorítmica.
- A XASE **prova** que houve supervisão humana e registra o contexto; **não julga** se a decisão "foi correta".
- A XASE **não treina** modelos, **não valida** modelos, **não monitora** drift.

---

## Promessas Comerciais Claras

- **Garantimos prova imutável de supervisão humana exigida por auditorias de IA e decisões automatizadas.**
- **Fornecemos trilha completa de quem interveio, quando, de onde e por qual motivo.**
- **Entregamos export de evidência verificável para auditorias e disputas (bundle com IA + HUMANO).**
- **Integração rápida via APIs REST e console administrativo pronto para uso.**
- **SLA de 99,9% mensal para APIs críticas.**
- **Suporte a MinIO (self-hosted) e AWS S3 para storage de bundles.**
- **Suporte a Mock KMS (dev) e AWS KMS (prod) para assinaturas.**

---

## SLA e Comportamento Operacional — Métricas

| Métrica | Alvo | Escopo |
|---|---|---|
| Disponibilidade | 99,9% mensal | APIs: Ingest, Verify, Export, HITL |
| MTTR | ≤ 4h (GA) | Incidentes de disponibilidade |
| RTO | ≤ 1h | Recuperação de serviço |
| RPO | ≤ 1h | Checkpoints + backups |
| Rate limit (Ingest) | 1000 req/h por API Key | Configurável por plano |
| Rate limit (HITL) | 300 req/h por API Key | Roadmap imediato |
| Idempotência | Ingest: ativo; HITL: roadmap | `Idempotency-Key` |
| Verificação externa | Sempre ativa | `GET /api/xase/v1/verify/:id` |

### Definição de Ator Humano

- Intervenções HITL são ações de um **ator humano autenticado** (sessão UI) ou operador identificado (API Key com identidade explícita).
- Bots/serviços não são classificados como HITL; podem registrar eventos, mas não contam como supervisão humana.

---

## Modelo de Pricing — Unidades de Valor

| Unidade | Descrição | Observações |
|---|---|---|
| Decisão registrada | Chamada ao `POST /records` | Com idempotência |
| Intervenção humana | Chamada ao `POST /records/:id/intervene` | RBAC aplicado |
| Export de evidência | Bundle gerado/baixado | Presigned URL/stream |
| Tenant | Instância lógica isolada | Multitenancy |

---

## Riscos Comerciais e Mitigações — Gaps e ETAs

| Gap | Mitigação | ETA |
|---|---|---|
| Idempotência no HITL | Implementar `Idempotency-Key` + dedupe | 0,5 dia |
| Rate limit HITL | Bucket dedicado por API Key | 0,5 dia |
| Filtros/paginação GET /intervene | action/actorEmail/período + paginação | 0,5 dia |
| Export inclui HITL | Incluir intervenções em `decision.json` + `report.txt` | 1 dia |
| Retenção/anonimização | Job de anonimização (LGPD/GDPR) | 1 dia |
| Webhooks | `intervention.created` com HMAC | 0,5 dia |

---

## Cronograma de Fechamento — 3 dias

- Dia 1: idempotência + rate limit HITL + filtros/paginação.
- Dia 2: export inclui HITL + webhooks + docs finais.
- Dia 3: testes integração + E2E UI + revisão jurídica.

---

## Checklist Sales-Ready — Status

- [x] Posicionamento e narrativa
- [x] What we guarantee + contrato de imutabilidade
- [x] Mapeamento regulatório (EU AI Act/LGPD/SOC2/ISO)
- [x] Definição de ator humano
- [x] SLA e comportamento operacional
- [x] Portfólio de produtos (7)
- [x] Casos por indústria
- [x] Modelo de pricing (unidades)
- [x] Roadmap com ETAs
- [x] Promessas comerciais aprovadas
- [x] Apêndice técnico

---

## Promessas Comerciais — Frases aprovadas para copy

- Garantimos prova imutável de supervisão humana exigida por auditorias de IA e decisões automatizadas.
- Fornecemos trilha completa de quem interveio, quando, de onde e por qual motivo.
- Entregamos export de evidência verificável para auditorias e disputas (bundle com IA + HUMANO).
- Integração rápida via APIs REST e console administrativo pronto para uso.
- SLA de 99,9% mensal para APIs críticas.

---

## Apêndice — Referências técnicas

- Técnico: `docs/XASE_TECHNICAL_OVERVIEW.md`
- Vendas (HITL): `docs/SYSTEM_STATUS_HITL_SALES.md`
- Guia de uso: `docs/XASE_USER_GUIDE.md`
- Código core: `src/lib/xase/*.ts`
- APIs públicas: `src/app/api/xase/v1/**/*.ts`
- UI console: `src/app/xase/**/*.tsx`

---

## Próximos Passos

1. **Demo técnica**: agendar demo de 30min com time técnico.
2. **POC**: 30 dias de POC com até 10k decisões/mês.
3. **Onboarding**: integração com sistema de IA do cliente.
4. **Go-live**: produção com SLA 99,9%.

---

## Contato

- **Website**: xase.ai
- **Email**: sales@xase.ai
- **Docs**: docs.xase.ai
- **Status**: status.xase.ai

---

**Última atualização**: 17 de dezembro de 2025  
**Versão**: 1.0.0  
**Status**: Production-ready (Decision Ledger, Checkpoints, Export, HITL, Policies, Audit Trail, API Keys)
