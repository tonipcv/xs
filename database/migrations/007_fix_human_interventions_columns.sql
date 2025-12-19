-- ============================================
-- XASE CORE - Migration 007: Fix HumanInterventions column names
-- Corrige divergência entre Prisma (@map("record_id")) e coluna criada como "recordId"
-- ============================================

-- Renomear coluna recordId -> record_id, se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'xase_human_interventions'
      AND column_name = 'recordId'
  ) THEN
    EXECUTE 'ALTER TABLE "xase_human_interventions" RENAME COLUMN "recordId" TO "record_id"';
  END IF;
END $$;

-- Verificar criação da coluna correta caso não exista nenhuma das duas (fallback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'xase_human_interventions'
      AND column_name = 'record_id'
  ) THEN
    -- Criar coluna e preencher a partir de recordId (se existir)
    EXECUTE 'ALTER TABLE "xase_human_interventions" ADD COLUMN "record_id" TEXT';
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'xase_human_interventions'
        AND column_name = 'recordId'
    ) THEN
      EXECUTE 'UPDATE "xase_human_interventions" SET "record_id" = "recordId" WHERE "record_id" IS NULL';
      EXECUTE 'ALTER TABLE "xase_human_interventions" DROP COLUMN "recordId"';
    END IF;
    EXECUTE 'ALTER TABLE "xase_human_interventions" ALTER COLUMN "record_id" SET NOT NULL';
  END IF;
END $$;

-- Índice de apoio
CREATE INDEX IF NOT EXISTS "xase_human_interventions_record_id_idx"
  ON "xase_human_interventions"("record_id");

-- ============================================
-- MIGRATION 007 COMPLETE
-- ============================================
