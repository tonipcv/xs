/*
Usage:
  EMAIL="user@example.com" node scripts/check-tenant-stats.js
  node scripts/check-tenant-stats.js user@example.com
Description:
  Prints tenants, users, and per-tenant counts for DecisionRecord, CheckpointRecord, and AuditLog (EXPORT_CREATED).
*/

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const emailArg = process.argv[2] || process.env.EMAIL || null;

  console.log('== Database inspection: tenants, users, and XASE counts ==');
  if (emailArg) console.log(`Filter email (for convenience): ${emailArg}`);

  // List tenants
  const tenants = await prisma.tenant.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { id: 'asc' },
  });
  console.log('\nTenants:', tenants);

  // List users
  const users = await prisma.user.findMany({
    select: { id: true, email: true, tenantId: true, name: true },
    orderBy: { id: 'asc' },
    where: emailArg ? { email: emailArg } : undefined,
  });
  console.log('\nUsers:', users);

  // Per-tenant counts
  console.log('\nPer-tenant counts:');
  for (const t of tenants) {
    const [records, checkpoints, exportsCount] = await Promise.all([
      prisma.decisionRecord.count({ where: { tenantId: t.id } }),
      prisma.checkpointRecord.count({ where: { tenantId: t.id } }),
      prisma.auditLog.count({ where: { tenantId: t.id, action: 'EXPORT_CREATED' } }),
    ]);
    console.log(`- Tenant ${t.id} (${t.email || 'no-email'}): records=${records}, checkpoints=${checkpoints}, exports=${exportsCount}`);
  }

  // If email is provided, show the tenant linkage for that user
  if (emailArg) {
    const user = await prisma.user.findFirst({
      where: { email: emailArg },
      select: { id: true, email: true, tenantId: true },
    });
    console.log('\nLinked user for email:', user);
    if (user?.tenantId) {
      const [records, checkpoints, exportsCount] = await Promise.all([
        prisma.decisionRecord.count({ where: { tenantId: user.tenantId } }),
        prisma.checkpointRecord.count({ where: { tenantId: user.tenantId } }),
        prisma.auditLog.count({ where: { tenantId: user.tenantId, action: 'EXPORT_CREATED' } }),
      ]);
      console.log(`Counts for user's tenant (${user.tenantId}): records=${records}, checkpoints=${checkpoints}, exports=${exportsCount}`);
    } else {
      console.log('User has no tenantId set.');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
