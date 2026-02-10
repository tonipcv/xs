-- ============================================
-- XASE CORE - Migration 005: Checkpoint Number & API Key Scopes
-- Adiciona monotonia de checkpoint e permissões por API Key
-- ============================================

-- 1. Adicionar checkpointNumber à tabela de checkpoints
ALTER TABLE "xase_checkpoint_records" 
ADD COLUMN IF NOT EXISTS "checkpointNumber" INTEGER;

-- 2. Preencher checkpointNumber para registros existentes (se houver)
-- Usar ROW_NUMBER() para criar sequência por tenant
WITH numbered_checkpoints AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY timestamp) as num
  FROM "xase_checkpoint_records"
  WHERE "checkpointNumber" IS NULL
)
UPDATE "xase_checkpoint_records" c
SET "checkpointNumber" = nc.num
FROM numbered_checkpoints nc
WHERE c.id = nc.id;

-- 3. Tornar checkpointNumber NOT NULL
ALTER TABLE "xase_checkpoint_records" 
ALTER COLUMN "checkpointNumber" SET NOT NULL;

-- 4. Criar índice e constraint único
CREATE INDEX IF NOT EXISTS "xase_checkpoint_records_tenantId_checkpointNumber_idx" 
  ON "xase_checkpoint_records"("tenantId", "checkpointNumber");

-- 5. Adicionar constraint único (tenantId + checkpointNumber)
-- Primeiro remover constraint se já existir
ALTER TABLE "xase_checkpoint_records" 
DROP CONSTRAINT IF EXISTS "xase_checkpoint_records_tenantId_checkpointNumber_key";

ALTER TABLE "xase_checkpoint_records" 
ADD CONSTRAINT "xase_checkpoint_records_tenantId_checkpointNumber_key" 
UNIQUE ("tenantId", "checkpointNumber");

-- 6. Adicionar permissions à tabela de API Keys
ALTER TABLE "xase_api_keys" 
ADD COLUMN IF NOT EXISTS "permissions" TEXT DEFAULT 'ingest,verify';

-- 7. Atualizar keys existentes com permissões padrão
UPDATE "xase_api_keys" 
SET "permissions" = 'ingest,verify' 
WHERE "permissions" IS NULL OR "permissions" = '';

-- 8. Criar função para validar monotonia de checkpoint
CREATE OR REPLACE FUNCTION validate_checkpoint_monotonicity()
RETURNS TRIGGER AS $$
DECLARE
  last_checkpoint_number INTEGER;
BEGIN
  -- Buscar último checkpointNumber do tenant
  SELECT "checkpointNumber" INTO last_checkpoint_number
  FROM "xase_checkpoint_records"
  WHERE "tenantId" = NEW."tenantId"
  ORDER BY "checkpointNumber" DESC
  LIMIT 1;
  
  -- Se existe checkpoint anterior, validar que o novo é maior
  IF last_checkpoint_number IS NOT NULL THEN
    IF NEW."checkpointNumber" <= last_checkpoint_number THEN
      RAISE EXCEPTION 'Checkpoint number must be monotonically increasing. Last: %, New: %', 
        last_checkpoint_number, NEW."checkpointNumber";
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Criar trigger de validação de monotonia
DROP TRIGGER IF EXISTS validate_checkpoint_monotonicity_trigger ON "xase_checkpoint_records";
CREATE TRIGGER validate_checkpoint_monotonicity_trigger
  BEFORE INSERT ON "xase_checkpoint_records"
  FOR EACH ROW
  EXECUTE FUNCTION validate_checkpoint_monotonicity();

-- ============================================
-- MIGRATION 005 COMPLETE
-- ============================================
-- Mudanças aplicadas:
-- - checkpointNumber adicionado (monotônico por tenant)
-- - permissions adicionado ao ApiKey
-- - Trigger de validação de monotonia
-- ============================================
