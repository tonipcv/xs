-- ============================================
-- XASE CORE - Migration 008: Fix created_at in HumanInterventions
-- Renomeia createdAt -> created_at (alinhado ao Prisma @map("created_at"))
-- ============================================

-- Renomear a coluna se existir como createdAt
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'xase_human_interventions'
      AND column_name = 'createdAt'
  ) THEN
    EXECUTE 'ALTER TABLE "xase_human_interventions" RENAME COLUMN "createdAt" TO "created_at"';
  END IF;
END $$;

-- Criar a coluna se nenhuma das duas existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'xase_human_interventions'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE 'ALTER TABLE "xase_human_interventions" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP';
  END IF;
END $$;

-- Índice opcional por created_at
CREATE INDEX IF NOT EXISTS "xase_human_interventions_created_at_idx"
  ON "xase_human_interventions"("created_at");

-- ============================================
-- MIGRATION 008 COMPLETE
-- ============================================
