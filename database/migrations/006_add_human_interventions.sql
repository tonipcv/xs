-- ============================================
-- XASE CORE - Migration 006: Human-in-the-Loop
-- Adiciona suporte completo para intervenções humanas
-- ============================================

-- 1. Criar ENUM para tipos de intervenção
DO $$ BEGIN
  CREATE TYPE "xase_intervention_action" AS ENUM (
    'REVIEW_REQUESTED',  -- Decisão marcada para revisão humana
    'APPROVED',          -- Humano aprovou decisão da IA
    'REJECTED',          -- Humano rejeitou decisão da IA
    'OVERRIDE',          -- Humano alterou o resultado da IA
    'ESCALATED'          -- Decisão escalada para nível superior
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Criar tabela de intervenções humanas
CREATE TABLE IF NOT EXISTS "xase_human_interventions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  
  -- Ação e ator
  "action" "xase_intervention_action" NOT NULL,
  "actorUserId" TEXT,  -- ID do usuário que interveio
  "actorName" TEXT,    -- Nome do ator (snapshot)
  "actorEmail" TEXT,   -- Email do ator (snapshot)
  "actorRole" TEXT,    -- Papel do ator no momento (snapshot)
  
  -- Contexto da intervenção
  "reason" TEXT,       -- Justificativa da intervenção
  "notes" TEXT,        -- Notas adicionais
  "metadata" TEXT,     -- JSON com contexto adicional
  
  -- Resultado (para OVERRIDE)
  "newOutcome" TEXT,   -- JSON com novo resultado (se OVERRIDE)
  "previousOutcome" TEXT, -- JSON com resultado anterior da IA
  
  -- Rastreabilidade
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign Keys
  CONSTRAINT "xase_human_interventions_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "xase_tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  
  CONSTRAINT "xase_human_interventions_recordId_fkey"
    FOREIGN KEY ("recordId")
    REFERENCES "xase_decision_records"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS "xase_human_interventions_tenantId_idx" 
  ON "xase_human_interventions"("tenantId");
CREATE INDEX IF NOT EXISTS "xase_human_interventions_recordId_idx" 
  ON "xase_human_interventions"("recordId");
CREATE INDEX IF NOT EXISTS "xase_human_interventions_action_idx" 
  ON "xase_human_interventions"("action");
CREATE INDEX IF NOT EXISTS "xase_human_interventions_actorUserId_idx" 
  ON "xase_human_interventions"("actorUserId");
CREATE INDEX IF NOT EXISTS "xase_human_interventions_timestamp_idx" 
  ON "xase_human_interventions"("timestamp" DESC);

-- 4. Criar trigger de imutabilidade
CREATE OR REPLACE FUNCTION prevent_intervention_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Human interventions are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_intervention_update ON "xase_human_interventions";
CREATE TRIGGER prevent_intervention_update
  BEFORE UPDATE ON "xase_human_interventions"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_intervention_modification();

DROP TRIGGER IF EXISTS prevent_intervention_delete ON "xase_human_interventions";
CREATE TRIGGER prevent_intervention_delete
  BEFORE DELETE ON "xase_human_interventions"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_intervention_modification();

-- 5. Adicionar campos opcionais ao DecisionRecord para facilitar queries
-- (Esses campos são derivados, não são fonte da verdade)
ALTER TABLE "xase_decision_records" 
ADD COLUMN IF NOT EXISTS "hasHumanIntervention" BOOLEAN DEFAULT false;

ALTER TABLE "xase_decision_records" 
ADD COLUMN IF NOT EXISTS "finalDecisionSource" TEXT DEFAULT 'AI';
-- Valores possíveis: 'AI', 'HUMAN_APPROVED', 'HUMAN_REJECTED', 'HUMAN_OVERRIDE'

CREATE INDEX IF NOT EXISTS "xase_decision_records_hasHumanIntervention_idx" 
  ON "xase_decision_records"("hasHumanIntervention");

-- 6. Comentários para documentação
COMMENT ON TABLE "xase_human_interventions" IS 'Registro imutável de intervenções humanas em decisões de IA';
COMMENT ON COLUMN "xase_human_interventions"."action" IS 'Tipo de intervenção: REVIEW_REQUESTED, APPROVED, REJECTED, OVERRIDE, ESCALATED';
COMMENT ON COLUMN "xase_human_interventions"."newOutcome" IS 'Novo resultado quando action=OVERRIDE (JSON)';
COMMENT ON COLUMN "xase_human_interventions"."reason" IS 'Justificativa obrigatória da intervenção';

-- ============================================
-- MIGRATION 006 COMPLETE
-- ============================================
-- Tabela criada:
-- - xase_human_interventions (com triggers de imutabilidade)
-- Campos adicionados:
-- - hasHumanIntervention em xase_decision_records
-- - finalDecisionSource em xase_decision_records
-- ============================================
