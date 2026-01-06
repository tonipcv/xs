/* Normalize legacy decisionType values to the current enum set.
   Safe default: map unknowns to 'OTHER'. Adjust mapping below as needed.

   Usage:
     node database/scripts/fix_decision_types.js
*/

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAPPINGS = {
  loan_approval: 'OTHER',
  fraud_check: 'FRAUD',
  pricing_eval: 'PRICING',
  underwrite: 'UNDERWRITING',
};

const VALID = new Set(['CLAIM', 'UNDERWRITING', 'FRAUD', 'PRICING', 'OTHER']);

async function main() {
  console.log('[fix_decision_types.js] Starting normalization...');

  const distinct = await prisma.decisionRecord.findMany({
    distinct: ['decisionType'],
    select: { decisionType: true },
    take: 1000,
  });
  const values = distinct
    .map((d) => d.decisionType)
    .filter((v) => v != null)
    .map((v) => String(v));
  console.log('[fix_decision_types.js] Distinct decisionType values:', values);

  let totalUpdated = 0;
  for (const [legacy, target] of Object.entries(MAPPINGS)) {
    const res = await prisma.decisionRecord.updateMany({
      where: { decisionType: legacy }, // legacy string values
      data: { decisionType: target },
    });
    if (res.count > 0) {
      console.log(` - Mapped '${legacy}' -> '${target}': ${res.count}`);
      totalUpdated += res.count;
    }
  }

  const resFallback = await prisma.decisionRecord.updateMany({
    where: {
      decisionType: { notIn: Array.from(VALID) },
    },
    data: { decisionType: 'OTHER' },
  });
  if (resFallback.count > 0) {
    console.log(` - Fallback to 'OTHER': ${resFallback.count}`);
    totalUpdated += resFallback.count;
  }

  const distribution = await prisma.decisionRecord.groupBy({ by: ['decisionType'], _count: true });
  console.log('[fix_decision_types.js] Final distribution:');
  for (const row of distribution) {
    console.log(`   ${row.decisionType || 'NULL'}: ${row._count}`);
  }

  console.log(`[fix_decision_types.js] Done. Updated rows: ${totalUpdated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
