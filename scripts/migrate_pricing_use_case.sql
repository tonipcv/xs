BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "planTier" TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS "useCasesIncluded" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "retentionYears" DOUBLE PRECISION NOT NULL DEFAULT 0.08;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'isPremium'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'isSuperPremium'
    ) THEN
      UPDATE "User"
      SET "planTier" = 'business',
          "useCasesIncluded" = 5,
          "retentionYears" = 5.0
      WHERE "isSuperPremium" = TRUE;

      UPDATE "User"
      SET "planTier" = 'team',
          "useCasesIncluded" = 2,
          "retentionYears" = 2.0
      WHERE "isPremium" = TRUE AND ("isSuperPremium" IS NULL OR "isSuperPremium" = FALSE);
    ELSE
      UPDATE "User"
      SET "planTier" = 'team',
          "useCasesIncluded" = 2,
          "retentionYears" = 2.0
      WHERE "isPremium" = TRUE;
    END IF;
  END IF;

  UPDATE "User" SET "freeTokensLimit" = 1000 WHERE "planTier" = 'sandbox';
  UPDATE "User" SET "freeTokensLimit" = 200000 WHERE "planTier" = 'team';
  UPDATE "User" SET "freeTokensLimit" = 500000 WHERE "planTier" = 'business';
  UPDATE "User" SET "freeTokensLimit" = 999999999 WHERE "planTier" IN ('enterprise', 'enterprise_plus');
END $$;

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'Subscription'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'priceId'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Subscription" DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

DROP TABLE IF EXISTS "Price" CASCADE;
DROP TABLE IF EXISTS "Plan" CASCADE;

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "isPremium",
  DROP COLUMN IF EXISTS "isSuperPremium";

COMMIT;

COMMENT ON COLUMN "User"."planTier" IS 'Pricing tier: sandbox|team|business|enterprise|enterprise_plus';
COMMENT ON COLUMN "User"."useCasesIncluded" IS 'Number of regulated use cases allowed';
COMMENT ON COLUMN "User"."retentionYears" IS 'Evidence retention in years (0.08 ~ 30 days)';
