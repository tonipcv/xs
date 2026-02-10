-- Migration: Drop legacy pricing flags and tables
-- Date: 2025-12-25

-- 1) Drop columns isPremium and isSuperPremium from User
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "isPremium",
  DROP COLUMN IF EXISTS "isSuperPremium";

-- 2) Drop legacy pricing tables if they still exist
DROP TABLE IF EXISTS "Price" CASCADE;
DROP TABLE IF EXISTS "Plan" CASCADE;
