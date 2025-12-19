# 📊 Xase Core - Service Level Objectives (SLO)

## 🎯 Visão Geral

Este documento define os objetivos de nível de serviço (SLOs) para o Xase Core, nossa plataforma de evidência forense para decisões de IA.

**Última atualização**: 2025-01-15
**Versão**: 1.0

---

## 🔐 Disponibilidade (Uptime)

### Target: 99.5% uptime mensal

- **Medição**: Disponibilidade dos endpoints de API
- **Janela**: Mensal (30 dias)
- **Downtime permitido**: ~3.6 horas/mês
- **Exclusões**: Manutenções programadas (notificadas com 48h de antecedência)

### Monitoramento
- Health check: `GET /api/xase/v1/records`
- Frequência: A cada 1 minuto
- Alertas: Downtime > 5 minutos

---

## ⚡ Latência

### Ingestão de Decisões
**Endpoint**: `POST /api/xase/v1/records`

- **p50**: < 200ms
- **p95**: < 500ms
- **p99**: < 1000ms

### Verificação
**Endpoint**: `GET /api/xase/v1/verify/:id`

- **p50**: < 150ms
- **p95**: < 400ms
- **p99**: < 800ms

### Export de Proof Bundle
**Endpoint**: `POST /api/xase/v1/export/:id`

- **p50**: < 500ms
- **p95**: < 2000ms
- **p99**: < 5000ms

### Checkpoint (Cron)
**Endpoint**: `POST /api/xase/v1/cron/checkpoint`

- **Duração total**: < 30 segundos (para até 100 tenants)
- **Por tenant**: < 500ms

---

## 📈 Throughput

### Ingestão
- **Capacidade**: 1000 requests/hora por API Key (configurável)
- **Burst**: Até 100 requests/minuto
- **Concorrência**: Até 50 requests simultâneos

### Rate Limiting
- **Tipo**: Sliding window (1 hora)
- **Resposta**: HTTP 429 com `Retry-After` header
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 🔒 Integridade de Dados

### Hash Chain
- **Garantia**: 100% dos records devem ter hash válido
- **Validação**: Automática no verify endpoint
- **Detecção de tamper**: < 1 segundo

### Checkpoint
- **Frequência**: A cada 1 hora (configurável)
- **Assinatura KMS**: 100% dos checkpoints assinados
- **Validação**: Automática no verify endpoint

### Imutabilidade
- **Triggers SQL**: Bloqueiam 100% das tentativas de UPDATE/DELETE
- **Audit Log**: 100% das ações administrativas logadas

---

## 📊 Confiabilidade

### Idempotency
- **TTL**: 24 horas
- **Garantia**: Requests duplicados retornam mesma resposta
- **Header**: `Idempotency-Key` (UUID v4 ou alfanumérico 16-64 chars)

### Error Rate
- **Target**: < 0.5% de erros 5xx
- **Medição**: Erros 5xx / Total de requests
- **Janela**: Horária

### Data Loss
- **Target**: Zero data loss
- **Backup**: Diário (quando implementado)
- **RPO**: 24 horas (Recovery Point Objective)
- **RTO**: 4 horas (Recovery Time Objective)

---

## 🔐 Segurança

### API Key Validation
- **Latência**: < 50ms
- **Taxa de sucesso**: > 99.9%

### Permissions
- **Validação**: 100% dos requests validados
- **Scopes**: `ingest`, `export`, `verify`
- **Resposta**: HTTP 403 para permissões insuficientes

### Audit Trail
- **Cobertura**: 100% das ações críticas
- **Imutabilidade**: 100% (triggers SQL)
- **Retenção**: Indefinida (ou conforme política do tenant)

---

## 📋 Métricas de Negócio

### Ingestão
- **Decisões/dia**: Monitorado por tenant
- **Tamanho médio**: Monitorado (input + output + context)
- **Payload armazenado**: % de requests com `storePayload=true`

### Checkpoints
- **Checkpoints/dia**: Monitorado por tenant
- **Assinaturas válidas**: 100%
- **Tempo médio**: < 500ms por tenant

### Exports
- **Exports/semana**: Monitorado por tenant
- **Tamanho médio**: Monitorado
- **Tempo médio**: < 2 segundos

---

## 🚨 Alertas e Incidentes

### Severidade

#### P0 - Crítico (resposta imediata)
- API completamente indisponível
- Data loss detectado
- Breach de segurança

#### P1 - Alto (resposta em 1h)
- Latência > 2x do SLO
- Error rate > 5%
- Checkpoint falhando

#### P2 - Médio (resposta em 4h)
- Latência > 1.5x do SLO
- Error rate > 1%
- Rate limit não funcionando

#### P3 - Baixo (resposta em 24h)
- Latência > 1.2x do SLO
- Logs com warnings
- Métricas fora do esperado

---

## 📈 Revisão e Melhoria

### Frequência
- **Revisão mensal**: Análise de SLOs e ajustes
- **Postmortem**: Após incidentes P0/P1
- **Atualização**: Conforme evolução do produto

### Error Budget
- **Cálculo**: (1 - SLO) × Total de requests
- **Exemplo**: 99.5% uptime = 0.5% error budget
- **Uso**: Priorizar confiabilidade vs features

---

## 🎯 Compromissos com Clientes

### Enterprise Tier
- **Uptime**: 99.9% (SLA com créditos)
- **Suporte**: 24/7 com resposta em 1h
- **Backups**: Diários com retenção de 90 dias

### Standard Tier
- **Uptime**: 99.5% (SLO, sem SLA)
- **Suporte**: Business hours (9-18h BRT)
- **Backups**: Semanais com retenção de 30 dias

### Free Tier
- **Uptime**: Best effort
- **Suporte**: Community (docs + GitHub issues)
- **Backups**: Não garantidos

---

## 📞 Contato

**Status Page**: https://status.xase.ai (quando implementado)
**Incidentes**: incidents@xase.ai
**Suporte**: support@xase.ai

---

## 📝 Notas

1. **SLO vs SLA**: SLOs são objetivos internos; SLAs são contratos com clientes.
2. **Medição**: Métricas coletadas via logs estruturados e monitoramento.
3. **Evolução**: SLOs serão ajustados conforme crescimento e feedback.
4. **Transparência**: Clientes enterprise terão acesso a dashboards de SLO.

---

**Versão**: 1.0
**Data**: 2025-01-15
**Próxima revisão**: 2025-02-15
