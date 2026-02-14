-- Normalize legacy decisionType values to valid enum set
-- Safe defaults: map unknowns to 'OTHER'. Adjust mapping as needed.

-- Preview distinct values (run first)
SELECT DISTINCT "decisionType" FROM "xase_decision_records" ORDER BY 1;

-- Example mappings (extend as necessary)
-- 'loan_approval' -> 'OTHER'
-- 'fraud_check'   -> 'FRAUD'
-- 'pricing_eval'  -> 'PRICING'
-- 'underwrite'    -> 'UNDERWRITING'

-- Updates (only affect rows with legacy values)
UPDATE "xase_decision_records"
SET "decisionType" = 'FRAUD'
WHERE "decisionType" = 'fraud_check';

UPDATE "xase_decision_records"
SET "decisionType" = 'PRICING'
WHERE "decisionType" = 'pricing_eval';

UPDATE "xase_decision_records"
SET "decisionType" = 'UNDERWRITING'
WHERE "decisionType" = 'underwrite';

-- Fallback: everything else goes to OTHER
UPDATE "xase_decision_records"
SET "decisionType" = 'OTHER'
WHERE "decisionType" IS NOT NULL
  AND "decisionType" NOT IN ('CLAIM','UNDERWRITING','FRAUD','PRICING','OTHER');

-- Verify
SELECT "decisionType", COUNT(*)
FROM "xase_decision_records"
GROUP BY 1
ORDER BY 2 DESC;
