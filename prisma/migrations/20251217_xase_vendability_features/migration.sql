-- ============================================
-- 🎯 XASE VENDABILITY FEATURES
-- ============================================
-- Adiciona suporte para:
-- 1. Model Cards (rastreabilidade de modelos)
-- 2. Drift Detection (monitoramento de qualidade)
-- 3. Alertas Proativos
-- 4. Métricas de Performance

-- 📊 MODEL CARD - Ficha técnica dos modelos de IA
CREATE TABLE IF NOT EXISTS "xase_model_cards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  
  -- Identificação do modelo
  "model_id" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "model_hash" TEXT NOT NULL, -- SHA-256 dos pesos/artefatos
  
  -- Metadata do modelo
  "model_name" TEXT,
  "model_type" TEXT, -- Ex: "random_forest", "neural_network", "gradient_boosting"
  "framework" TEXT, -- Ex: "scikit-learn", "tensorflow", "pytorch"
  "description" TEXT,
  
  -- Treinamento
  "training_date" TIMESTAMP,
  "dataset_hash" TEXT, -- SHA-256 do dataset de treino
  "dataset_size" INTEGER,
  "training_duration_seconds" INTEGER,
  
  -- Performance Metrics (JSON)
  "performance_metrics" TEXT, -- JSON: {accuracy, precision, recall, f1, auc_roc, etc}
  "fairness_metrics" TEXT, -- JSON: {demographic_parity, equal_opportunity, etc}
  "validation_metrics" TEXT, -- JSON: métricas no conjunto de validação
  
  -- Uso pretendido
  "intended_use" TEXT,
  "limitations" TEXT,
  "ethical_considerations" TEXT,
  
  -- Feature Schema
  "feature_schema_hash" TEXT,
  "feature_schema" TEXT, -- JSON com schema das features
  "feature_importance" TEXT, -- JSON com importância de cada feature
  
  -- Status
  "is_active" BOOLEAN DEFAULT true,
  "deployed_at" TIMESTAMP,
  "deprecated_at" TIMESTAMP,
  
  -- Timestamps
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT "fk_model_card_tenant" FOREIGN KEY ("tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "unique_model_version" UNIQUE ("tenant_id", "model_id", "model_version")
);

CREATE INDEX "idx_model_cards_tenant" ON "xase_model_cards"("tenant_id");
CREATE INDEX "idx_model_cards_model_id" ON "xase_model_cards"("model_id");
CREATE INDEX "idx_model_cards_model_hash" ON "xase_model_cards"("model_hash");
CREATE INDEX "idx_model_cards_is_active" ON "xase_model_cards"("is_active");

-- 📈 DRIFT DETECTION - Monitoramento de drift de modelos
CREATE TABLE IF NOT EXISTS "xase_drift_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  
  -- Tipo de drift
  "drift_type" TEXT NOT NULL, -- "DATA_DRIFT", "CONCEPT_DRIFT", "PREDICTION_DRIFT"
  "severity" TEXT NOT NULL, -- "LOW", "MEDIUM", "HIGH", "CRITICAL"
  
  -- Métricas de drift
  "drift_score" REAL NOT NULL, -- 0-1, quanto maior pior
  "threshold" REAL NOT NULL, -- Threshold configurado
  "metric_name" TEXT, -- Ex: "psi", "kl_divergence", "accuracy_drop"
  
  -- Detalhes
  "affected_features" TEXT, -- JSON array com features afetadas
  "baseline_period_start" TIMESTAMP,
  "baseline_period_end" TIMESTAMP,
  "detection_period_start" TIMESTAMP,
  "detection_period_end" TIMESTAMP,
  
  -- Estatísticas
  "baseline_stats" TEXT, -- JSON com estatísticas do período baseline
  "current_stats" TEXT, -- JSON com estatísticas do período atual
  "sample_size" INTEGER,
  
  -- Ações
  "alert_sent" BOOLEAN DEFAULT false,
  "alert_sent_at" TIMESTAMP,
  "resolved" BOOLEAN DEFAULT false,
  "resolved_at" TIMESTAMP,
  "resolution_notes" TEXT,
  
  -- Timestamps
  "detected_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT "fk_drift_tenant" FOREIGN KEY ("tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_drift_tenant" ON "xase_drift_records"("tenant_id");
CREATE INDEX "idx_drift_model" ON "xase_drift_records"("model_id");
CREATE INDEX "idx_drift_severity" ON "xase_drift_records"("severity");
CREATE INDEX "idx_drift_detected_at" ON "xase_drift_records"("detected_at");
CREATE INDEX "idx_drift_resolved" ON "xase_drift_records"("resolved");

-- 🔔 ALERTS - Sistema de alertas proativos
CREATE TABLE IF NOT EXISTS "xase_alerts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  
  -- Tipo e severidade
  "alert_type" TEXT NOT NULL, -- "DRIFT_DETECTED", "HIGH_OVERRIDE_RATE", "LOW_CONFIDENCE", "ANOMALY_DETECTED"
  "severity" TEXT NOT NULL, -- "INFO", "WARNING", "ERROR", "CRITICAL"
  "status" TEXT NOT NULL DEFAULT 'OPEN', -- "OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"
  
  -- Contexto
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "resource_type" TEXT, -- "MODEL", "POLICY", "DECISION_RECORD"
  "resource_id" TEXT,
  
  -- Métricas relacionadas
  "metric_name" TEXT,
  "metric_value" REAL,
  "threshold_value" REAL,
  
  -- Detalhes
  "details" TEXT, -- JSON com detalhes adicionais
  "recommendations" TEXT, -- JSON com recomendações de ação
  
  -- Notificações
  "notification_sent" BOOLEAN DEFAULT false,
  "notification_sent_at" TIMESTAMP,
  "notification_channels" TEXT, -- JSON: ["email", "slack", "webhook"]
  
  -- Resolução
  "acknowledged_by" TEXT,
  "acknowledged_at" TIMESTAMP,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP,
  "resolution_notes" TEXT,
  
  -- Timestamps
  "triggered_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT "fk_alert_tenant" FOREIGN KEY ("tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_alerts_tenant" ON "xase_alerts"("tenant_id");
CREATE INDEX "idx_alerts_type" ON "xase_alerts"("alert_type");
CREATE INDEX "idx_alerts_severity" ON "xase_alerts"("severity");
CREATE INDEX "idx_alerts_status" ON "xase_alerts"("status");
CREATE INDEX "idx_alerts_triggered_at" ON "xase_alerts"("triggered_at");

-- 📊 METRICS SNAPSHOT - Snapshots periódicos de métricas
CREATE TABLE IF NOT EXISTS "xase_metrics_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  
  -- Período
  "snapshot_type" TEXT NOT NULL, -- "HOURLY", "DAILY", "WEEKLY", "MONTHLY"
  "period_start" TIMESTAMP NOT NULL,
  "period_end" TIMESTAMP NOT NULL,
  
  -- Métricas agregadas
  "total_decisions" INTEGER NOT NULL DEFAULT 0,
  "ai_decisions" INTEGER NOT NULL DEFAULT 0,
  "human_interventions" INTEGER NOT NULL DEFAULT 0,
  "override_count" INTEGER NOT NULL DEFAULT 0,
  "approval_count" INTEGER NOT NULL DEFAULT 0,
  "rejection_count" INTEGER NOT NULL DEFAULT 0,
  
  -- Taxas calculadas
  "override_rate" REAL, -- Percentual de overrides
  "intervention_rate" REAL, -- Percentual de intervenções
  "approval_rate" REAL, -- Percentual de aprovações
  
  -- Performance
  "avg_confidence" REAL,
  "avg_processing_time_ms" REAL,
  "p95_processing_time_ms" REAL,
  "p99_processing_time_ms" REAL,
  
  -- Por modelo (JSON)
  "metrics_by_model" TEXT, -- JSON: {model_id: {decisions, overrides, avg_confidence, etc}}
  "metrics_by_policy" TEXT, -- JSON: {policy_id: {decisions, overrides, etc}}
  "metrics_by_decision_type" TEXT, -- JSON: {decision_type: {count, overrides, etc}}
  
  -- Top motivos de override
  "top_override_reasons" TEXT, -- JSON array
  
  -- Timestamps
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT "fk_metrics_tenant" FOREIGN KEY ("tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "unique_snapshot_period" UNIQUE ("tenant_id", "snapshot_type", "period_start")
);

CREATE INDEX "idx_metrics_tenant" ON "xase_metrics_snapshots"("tenant_id");
CREATE INDEX "idx_metrics_period" ON "xase_metrics_snapshots"("period_start", "period_end");
CREATE INDEX "idx_metrics_type" ON "xase_metrics_snapshots"("snapshot_type");

-- 🎯 ALERT RULES - Regras configuráveis de alertas
CREATE TABLE IF NOT EXISTS "xase_alert_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  
  -- Identificação
  "rule_name" TEXT NOT NULL,
  "rule_type" TEXT NOT NULL, -- "THRESHOLD", "ANOMALY", "TREND"
  "description" TEXT,
  
  -- Condições
  "metric_name" TEXT NOT NULL, -- Ex: "override_rate", "avg_confidence", "drift_score"
  "operator" TEXT NOT NULL, -- "GT", "LT", "EQ", "GTE", "LTE"
  "threshold_value" REAL NOT NULL,
  "time_window_minutes" INTEGER, -- Janela de tempo para agregação
  
  -- Filtros
  "model_id" TEXT, -- Aplicar apenas a um modelo específico
  "policy_id" TEXT, -- Aplicar apenas a uma política específica
  "decision_type" TEXT, -- Aplicar apenas a um tipo de decisão
  
  -- Ações
  "severity" TEXT NOT NULL, -- "INFO", "WARNING", "ERROR", "CRITICAL"
  "notification_channels" TEXT, -- JSON: ["email", "slack", "webhook"]
  "notification_template" TEXT,
  
  -- Status
  "is_active" BOOLEAN DEFAULT true,
  "last_triggered_at" TIMESTAMP,
  "trigger_count" INTEGER DEFAULT 0,
  
  -- Cooldown (evitar spam)
  "cooldown_minutes" INTEGER DEFAULT 60,
  
  -- Timestamps
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT "fk_alert_rule_tenant" FOREIGN KEY ("tenant_id") REFERENCES "xase_tenants"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_alert_rules_tenant" ON "xase_alert_rules"("tenant_id");
CREATE INDEX "idx_alert_rules_active" ON "xase_alert_rules"("is_active");
CREATE INDEX "idx_alert_rules_metric" ON "xase_alert_rules"("metric_name");

-- Adicionar comentários para documentação
COMMENT ON TABLE "xase_model_cards" IS 'Fichas técnicas dos modelos de IA com métricas de performance e fairness';
COMMENT ON TABLE "xase_drift_records" IS 'Registros de detecção de drift (data drift, concept drift, prediction drift)';
COMMENT ON TABLE "xase_alerts" IS 'Sistema de alertas proativos para anomalias e problemas de qualidade';
COMMENT ON TABLE "xase_metrics_snapshots" IS 'Snapshots periódicos de métricas agregadas para dashboard';
COMMENT ON TABLE "xase_alert_rules" IS 'Regras configuráveis para disparo automático de alertas';
