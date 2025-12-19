# 🚀 XASE Vendability Features - Implementação Completa

## 📋 Sumário Executivo

Este documento descreve as melhorias implementadas no XASE para torná-lo mais vendável, focando em **provas concretas da qualidade da IA**, explicabilidade, e monitoramento proativo.

### 🎯 Problema Resolvido

**Antes**: XASE provava que houve supervisão humana, mas não provava a qualidade da IA.

**Depois**: XASE agora prova:
- ✅ **QUE** a IA decidiu (proof.json)
- ✅ **POR QUE** a IA decidiu (explanation.json - XAI)
- ✅ **QUAL** modelo decidiu (model_card.json)
- ✅ **COM QUAL** performance (métricas no model_card)
- ✅ **QUANDO** intervir (alertas proativos)

---

## 🎨 Features Implementadas

### 1️⃣ Explicabilidade (XAI) no Bundle ⭐

**O que é**: Inclusão de explicações de decisões de IA (SHAP, LIME, etc) no bundle de evidências.

**Valor comercial**: "Não só provamos QUE a IA decidiu, mas POR QUE decidiu."

#### Como usar:

```typescript
// Ao registrar decisão, incluir explanation
await client.recordDecision({
  input: { ... },
  output: { ... },
  explanation: {
    method: 'SHAP',
    model_output: 0.85,
    base_value: 0.5,
    shap_values: {
      credit_score: 0.25,
      income: 0.15,
      debt_ratio: -0.05
    },
    top_features: [
      { name: 'credit_score', importance: 0.25, contribution: 'positive' },
      { name: 'income', importance: 0.15, contribution: 'positive' }
    ],
    confidence: 0.85,
    explanation_text: 'Aprovado devido ao bom credit score...'
  }
})
```

#### O que vai no bundle:

```json
// explanation.json
{
  "method": "SHAP",
  "model_output": 0.85,
  "shap_values": { ... },
  "top_features": [ ... ],
  "explanation_text": "..."
}
```

#### Aparece no report.txt:

```
Explainability (XAI)
  Method: SHAP
  Top Features:
    - credit_score: 0.25
    - income: 0.15
    - debt_ratio: -0.05
```

---

### 2️⃣ Model Card no Bundle ⭐

**O que é**: Ficha técnica do modelo de IA com métricas de performance, fairness, e metadata.

**Valor comercial**: "Provamos qual modelo, com qual performance, tomou cada decisão."

#### Como registrar um Model Card:

```bash
POST /api/xase/v1/model-cards
Content-Type: application/json
X-API-Key: xase_...

{
  "model_id": "credit_scoring_v2",
  "model_version": "2.1.0",
  "model_name": "Credit Scoring Model",
  "model_type": "gradient_boosting",
  "framework": "xgboost",
  "training_date": "2025-01-15T00:00:00Z",
  "dataset_hash": "sha256:abc123...",
  "dataset_size": 50000,
  "performance_metrics": {
    "accuracy": 0.94,
    "precision": 0.91,
    "recall": 0.89,
    "f1_score": 0.90,
    "auc_roc": 0.96
  },
  "fairness_metrics": {
    "demographic_parity": 0.95,
    "equal_opportunity": 0.93
  },
  "intended_use": "Credit scoring for loans up to R$100k",
  "limitations": "Not suitable for business loans",
  "feature_schema": { ... },
  "feature_importance": { ... }
}
```

#### O que vai no bundle:

```json
// model_card.json
{
  "model_id": "credit_scoring_v2",
  "model_version": "2.1.0",
  "model_hash": "sha256:...",
  "performance_metrics": {
    "accuracy": 0.94,
    "precision": 0.91,
    "auc_roc": 0.96
  },
  "fairness_metrics": { ... },
  "intended_use": "...",
  "limitations": "..."
}
```

#### Aparece no report.txt:

```
Model Card
  Name: Credit Scoring Model
  Type: gradient_boosting
  Framework: xgboost
  Training Date: 2025-01-15
  Performance Metrics:
    Accuracy: 0.94
    Precision: 0.91
    Recall: 0.89
    AUC-ROC: 0.96
  Intended Use: Credit scoring for loans up to R$100k
```

---

### 3️⃣ Dashboard de Confiança 📊

**O que é**: Interface web para visualizar métricas de qualidade em tempo real.

**Valor comercial**: "Veja em tempo real a qualidade das decisões e onde intervir."

#### Acesso:

```
https://seu-dominio.com/xase/dashboard
```

#### Métricas exibidas:

- **Total de Decisões**: IA vs Humano
- **Taxa de Override**: % de decisões alteradas por humanos
- **Confiança Média**: Confiança média do modelo
- **Taxa de Aprovação**: % de aprovações humanas
- **Decisões por Fonte**: Gráfico IA vs Humano
- **Top Motivos de Override**: Razões mais comuns
- **Performance por Modelo**: Comparação de modelos
- **Alertas Ativos**: Problemas detectados

#### API de Métricas:

```bash
GET /api/xase/v1/metrics?period=24h&model_id=credit_v2
X-API-Key: xase_...

Response:
{
  "period": "24h",
  "summary": {
    "total_decisions": 1000,
    "ai_decisions": 880,
    "human_interventions": 120,
    "override_count": 50
  },
  "rates": {
    "override_rate": 5.0,
    "intervention_rate": 12.0,
    "approval_rate": 58.3
  },
  "performance": {
    "avg_confidence": 0.87,
    "avg_processing_time_ms": 45
  },
  "top_override_reasons": [
    { "reason": "Low confidence", "count": 20 },
    { "reason": "Manual review required", "count": 15 }
  ],
  "metrics_by_model": {
    "credit_v2": {
      "decisions": 1000,
      "overrides": 50,
      "override_rate": 5.0,
      "avg_confidence": 0.87
    }
  }
}
```

---

### 4️⃣ Alertas Proativos 🔔

**O que é**: Sistema de alertas automáticos para anomalias e problemas de qualidade.

**Valor comercial**: "Cliente descobre problemas antes que virem crise."

#### Tipos de Alertas:

- **HIGH_OVERRIDE_RATE**: Taxa de override aumentou significativamente
- **LOW_CONFIDENCE**: Confiança média caiu abaixo do threshold
- **DRIFT_DETECTED**: Drift de dados ou conceito detectado
- **ANOMALY_DETECTED**: Comportamento anômalo detectado

#### Como funcionam:

1. **Cron job** roda a cada hora (`/api/xase/v1/cron/metrics-snapshot`)
2. **Detecta anomalias** comparando período atual com referência
3. **Cria alertas** automaticamente
4. **Notifica** via email/Slack/webhook (futuro)

#### API de Alertas:

```bash
GET /api/xase/v1/alerts?status=OPEN&severity=CRITICAL
X-API-Key: xase_...

Response:
{
  "alerts": [
    {
      "id": "alert_123",
      "alert_type": "HIGH_OVERRIDE_RATE",
      "severity": "WARNING",
      "status": "OPEN",
      "title": "Override rate increased",
      "message": "Override rate increased from 5% to 15%",
      "metric_value": 15.0,
      "threshold_value": 10.0,
      "triggered_at": "2025-12-17T18:00:00Z"
    }
  ]
}
```

---

### 5️⃣ Drift Detection (Básico) 📈

**O que é**: Detecção de quando o modelo começa a errar sistematicamente.

**Valor comercial**: "Detecta quando o modelo precisa ser retreinado."

#### Como funciona:

- Compara métricas do período atual com baseline
- Detecta:
  - **Data Drift**: Distribuição dos inputs mudou
  - **Concept Drift**: Relação input-output mudou
  - **Prediction Drift**: Qualidade das predições caiu

#### Implementação:

```typescript
// Detectar anomalias (inclui drift detection básico)
const anomalies = await detectAnomalies(tenantId)

// Anomalias incluem:
// - HIGH_OVERRIDE_RATE (possível concept drift)
// - LOW_CONFIDENCE (possível data drift)
```

---

### 6️⃣ Snapshots de Métricas 📸

**O que é**: Snapshots periódicos de métricas agregadas para análise histórica.

**Valor comercial**: "Veja evolução da qualidade ao longo do tempo."

#### Tipos de Snapshots:

- **HOURLY**: A cada hora
- **DAILY**: Diário
- **WEEKLY**: Semanal
- **MONTHLY**: Mensal

#### Schema:

```typescript
{
  snapshot_type: 'HOURLY',
  period_start: '2025-12-17T17:00:00Z',
  period_end: '2025-12-17T18:00:00Z',
  total_decisions: 100,
  ai_decisions: 85,
  human_interventions: 15,
  override_count: 5,
  override_rate: 5.0,
  avg_confidence: 0.87,
  metrics_by_model: { ... },
  top_override_reasons: [ ... ]
}
```

---

## 🗄️ Schema do Banco de Dados

### Novas Tabelas:

1. **xase_model_cards**: Fichas técnicas dos modelos
2. **xase_drift_records**: Registros de drift detectado
3. **xase_alerts**: Alertas proativos
4. **xase_metrics_snapshots**: Snapshots periódicos
5. **xase_alert_rules**: Regras de alertas configuráveis

### Migration:

```bash
# Aplicar migration
npx prisma migrate dev --name xase_vendability_features

# Gerar Prisma Client
npx prisma generate
```

---

## 📦 Estrutura do Bundle (Atualizada)

```
evidence_txn_abc.zip
├── decision.json           # Decisão + modelo
├── proof.json              # Assinatura criptográfica
├── explanation.json        # ⭐ NOVO: Explicabilidade (SHAP/LIME)
├── model_card.json         # ⭐ NOVO: Ficha técnica do modelo
├── policy.json             # Política aplicada
├── payloads/
│   ├── input.json
│   ├── output.json
│   └── context.json
├── report.txt              # ⭐ ATUALIZADO: Inclui XAI e Model Card
└── verify.js               # Script de verificação offline
```

---

## 🎯 Pitch de Vendas (Atualizado)

### Antes:
"XASE prova que houve supervisão humana."

### Depois:
"XASE prova que houve supervisão humana, **explica por que a IA decidiu**, **registra qual modelo com qual performance tomou a decisão**, e **mostra em tempo real quando intervir**."

### Diferenciação:

| Feature | Concorrente A | Concorrente B | XASE |
|---------|---------------|---------------|------|
| Prova de supervisão | ✅ | ✅ | ✅ |
| Explicabilidade (XAI) | ❌ | ⚠️ Básico | ✅ Completo |
| Model Cards | ❌ | ❌ | ✅ |
| Dashboard de Métricas | ⚠️ Básico | ✅ | ✅ |
| Alertas Proativos | ❌ | ⚠️ Manual | ✅ Automático |
| Drift Detection | ❌ | ❌ | ✅ |

---

## 🚀 Como Usar

### 1. Registrar Model Card (uma vez por versão):

```bash
curl -X POST https://api.xase.ai/v1/model-cards \
  -H "X-API-Key: xase_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "credit_v2",
    "model_version": "2.1.0",
    "performance_metrics": {
      "accuracy": 0.94,
      "auc_roc": 0.96
    }
  }'
```

### 2. Registrar Decisão com XAI:

```typescript
await client.recordDecision({
  input: { ... },
  output: { ... },
  model_id: 'credit_v2',
  model_version: '2.1.0',
  explanation: {
    method: 'SHAP',
    shap_values: { ... },
    top_features: [ ... ]
  }
})
```

### 3. Visualizar Dashboard:

```
https://seu-dominio.com/xase/dashboard
```

### 4. Configurar Cron (Vercel):

```json
// vercel.json
{
  "crons": [{
    "path": "/api/xase/v1/cron/metrics-snapshot",
    "schedule": "0 * * * *"
  }]
}
```

---

## 📊 Métricas de Sucesso

### KPIs para Vendas:

- **Taxa de Override**: < 10% indica modelo de alta qualidade
- **Confiança Média**: > 0.85 indica modelo confiável
- **Taxa de Aprovação**: > 80% indica boa supervisão humana
- **Alertas Resolvidos**: < 24h indica time proativo

### Exemplo de Case:

**Cliente**: Fintech de crédito
**Antes**: 15% override rate, sem visibilidade
**Depois**: 8% override rate, alertas proativos, dashboard em tempo real
**ROI**: 40% redução em revisões manuais

---

## 🔧 Configuração

### Variáveis de Ambiente:

```bash
# .env
DATABASE_URL=postgresql://...
CRON_SECRET=your_secret_here
```

### Dependências:

```json
{
  "dependencies": {
    "@prisma/client": "^5.x",
    "jszip": "^3.x"
  }
}
```

---

## 📚 Exemplos

### Exemplo Completo:

```bash
cd packages/sdk-js/examples
ts-node with-xai-and-model-card.ts
```

### Exemplo de Dashboard:

```bash
npm run dev
# Acesse: http://localhost:3000/xase/dashboard
```

---

## 🎓 Treinamento de Vendas

### Objeções Comuns:

**"Já temos logs de decisões"**
→ "Mas vocês têm explicabilidade? Model cards? Alertas proativos? Dashboard de confiança?"

**"É muito complexo"**
→ "É só adicionar 2 campos no JSON: `explanation` e `model_id`. O resto é automático."

**"Não temos SHAP"**
→ "Podemos oferecer como serviço ou vocês podem usar qualquer método de XAI."

---

## 🚦 Status de Implementação

- ✅ Schema do banco estendido
- ✅ API de métricas
- ✅ API de model cards
- ✅ API de alertas
- ✅ Explicabilidade no bundle
- ✅ Model card no bundle
- ✅ Dashboard de confiança
- ✅ Detecção de anomalias
- ✅ Cron job de snapshots
- ✅ Exemplo completo
- ✅ Documentação

---

## 🔜 Próximos Passos (Futuro)

1. **SIEM Export**: Export para Splunk/Datadog
2. **Multi-idioma**: Reports em PT-BR, EN, ES
3. **Drift Detection Avançado**: PSI, KL Divergence
4. **Notificações**: Email, Slack, Webhook
5. **Alert Rules**: Regras configuráveis de alertas
6. **A/B Testing**: Comparação de modelos

---

## 📞 Suporte

Para dúvidas ou suporte:
- Email: support@xase.ai
- Docs: https://docs.xase.ai
- Slack: https://xase.slack.com

---

**Versão**: 1.0.0  
**Data**: 17 de Dezembro de 2025  
**Autor**: XASE Team
