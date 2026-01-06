/*
  Normalize legacy decisionType values to the current enum set.
  Safe default: map unknowns to 'OTHER'. Adjust mapping below as needed.

  Usage:
    - With ts-node:
        npx ts-node database/scripts/fix_decision_types.ts
    - Or build and run with Node (if you prefer JS):
        npx esbuild database/scripts/fix_decision_types.ts --bundle --platform=node --outfile=dist/fix_decision_types.js
        node dist/fix_decision_types.js
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend mapping as needed
const MAPPINGS: Record<string, 'CLAIM' | 'UNDERWRITING' | 'FRAUD' | 'PRICING' | 'OTHER'> = {
  loan_approval: 'OTHER',
  fraud_check: 'FRAUD',
  pricing_eval: 'PRICING',
  underwrite: 'UNDERWRITING',
};

const VALID: Set<string> = new Set(['CLAIM', 'UNDERWRITING', 'FRAUD', 'PRICING', 'OTHER']);

async function main() {
  console.log('[fix_decision_types] Starting normalization...');

  // 1) List distinct values
  const distinct = await prisma.decisionRecord.findMany({
    distinct: ['decisionType'],
    select: { decisionType: true },
    take: 1000,
  });
  const values = distinct
    .map((d) => d.decisionType)
    .filter((v): v is Exclude<typeof v, null> => v != null)
    .map((v) => String(v));
  console.log('[fix_decision_types] Distinct decisionType values:', values);

  // 2) Build update batches for known mappings
  let totalUpdated = 0;
  for (const [legacy, target] of Object.entries(MAPPINGS)) {
    const res = await prisma.decisionRecord.updateMany({
      // Cast to any to allow updating legacy string values that aren't in the enum
      where: { decisionType: legacy as any },
      data: { decisionType: target },
    });
    if (res.count > 0) {
      console.log(` - Mapped '${legacy}' -> '${target}': ${res.count}`);
      totalUpdated += res.count;
    }
  }

  // 3) Fallback others to OTHER (only non-null and not in VALID)
  const resFallback = await prisma.decisionRecord.updateMany({
    where: {
      // Only non-null legacy values not in VALID set
      decisionType: {
        notIn: Array.from(VALID) as any,
      },
    },
    data: { decisionType: 'OTHER' },
  });
  if (resFallback.count > 0) {
    console.log(` - Fallback to 'OTHER': ${resFallback.count}`);
    totalUpdated += resFallback.count;
  }

  // 4) Report final distribution
  const distribution = await prisma.decisionRecord.groupBy({
    by: ['decisionType'],
    _count: true,
  });
  console.log('[fix_decision_types] Final distribution:');
  for (const row of distribution) {
    console.log(`   ${row.decisionType || 'NULL'}: ${row._count}`);
  }

  console.log(`[fix_decision_types] Done. Updated rows: ${totalUpdated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
