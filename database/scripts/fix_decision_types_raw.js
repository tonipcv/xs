/*
  Normalize legacy decisionType values to the current enum set using raw SQL.
  This avoids Prisma Client enum decoding when there are legacy strings.

  Usage:
    node database/scripts/fix_decision_types_raw.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID = ['CLAIM', 'UNDERWRITING', 'FRAUD', 'PRICING', 'OTHER'];

const MAPPINGS = [
  { from: 'loan_approval', to: 'OTHER' },
  { from: 'fraud_check', to: 'FRAUD' },
  { from: 'pricing_eval', to: 'PRICING' },
  { from: 'underwrite', to: 'UNDERWRITING' },
  // Add more mappings here if needed
  { from: 'CREDIT_APPROVAL', to: 'UNDERWRITING' },
];

async function main() {
  console.log('[fix_decision_types_raw] Starting normalization via raw SQL...');

  // Preview (raw SQL) - will not decode enum via Prisma
  try {
    const preview = await prisma.$queryRawUnsafe(
      'SELECT DISTINCT "decisionType" FROM "xase_decision_records" ORDER BY 1'
    );
    console.log('[preview] distinct decisionType values:', preview.map((r) => r.decisionType));
  } catch (e) {
    console.warn('[preview] Skipped preview due to error:', e?.message || e);
  }

  let totalUpdated = 0;

  // Apply explicit mappings
  for (const { from, to } of MAPPINGS) {
    const sql =
      'UPDATE "xase_decision_records" SET "decisionType" = $1 WHERE "decisionType" = $2';
    const res = await prisma.$executeRawUnsafe(sql, to, from);
    if (res > 0) {
      console.log(` - Mapped '${from}' -> '${to}': ${res}`);
      totalUpdated += Number(res);
    }
  }

  // Fallback everything not in VALID to OTHER
  const placeholders = VALID.map((_, i) => `$${i + 1}`).join(', ');
  const fallbackSql = `UPDATE "xase_decision_records"
    SET "decisionType" = 'OTHER'
    WHERE "decisionType" IS NOT NULL
      AND "decisionType" NOT IN (${placeholders})`;
  const resFallback = await prisma.$executeRawUnsafe(fallbackSql, ...VALID);
  if (resFallback > 0) {
    console.log(` - Fallback to 'OTHER': ${resFallback}`);
    totalUpdated += Number(resFallback);
  }

  // Final distribution
  try {
    const dist = await prisma.$queryRawUnsafe(
      'SELECT "decisionType", COUNT(*) AS cnt FROM "xase_decision_records" GROUP BY 1 ORDER BY 2 DESC'
    );
    console.log('[final] distribution:');
    for (const row of dist) {
      console.log(`   ${row.decisionType || 'NULL'}: ${row.cnt}`);
    }
  } catch (e) {
    console.warn('[final] Skipped distribution due to error:', e?.message || e);
  }

  console.log(`[fix_decision_types_raw] Done. Updated rows: ${totalUpdated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
