-- Migration: Add pricing entitlements fields to User
-- Date: 2025-12-25
-- Purpose: Support use-case-based annual pricing tiers

ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "planTier" TEXT NOT NULL DEFAULT 'sandbox',
ADD COLUMN IF NOT EXISTS "useCasesIncluded" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "retentionYears" DOUBLE PRECISION NOT NULL DEFAULT 0.08;

-- Update existing users to sandbox tier (default)
-- Premium users can be migrated to 'team' or 'business' based on current isPremium/isSuperPremium
UPDATE "User" 
SET "planTier" = 'team', 
    "useCasesIncluded" = 2,
    "retentionYears" = 2.0
WHERE "isPremium" = true AND "isSuperPremium" = false;

UPDATE "User" 
SET "planTier" = 'business', 
    "useCasesIncluded" = 5,
    "retentionYears" = 5.0
WHERE "isSuperPremium" = true;

-- Comment for future reference
COMMENT ON COLUMN "User"."planTier" IS 'Pricing tier: sandbox|team|business|enterprise|enterprise_plus';
COMMENT ON COLUMN "User"."useCasesIncluded" IS 'Number of regulated use cases allowed in production';
COMMENT ON COLUMN "User"."retentionYears" IS 'Evidence retention period in years (0.08 = 30 days for sandbox)';
