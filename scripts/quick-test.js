const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    // Test 1: AccessOffer sem maxLeaseDurationHours
    console.log('Test 1: AccessOffer...');
    const tenant = await prisma.tenant.create({
      data: { name: 'Quick Test', email: `qt${Date.now()}@test.com`, organizationType: 'SUPPLIER' }
    });
    const dataset = await prisma.dataset.create({
      data: {
        tenantId: tenant.id,
        datasetId: `ds${Date.now()}`,
        name: 'Test',
        storageLocation: 's3://test',
        language: 'en-US',
      }
    });
    const offer = await prisma.accessOffer.create({
      data: {
        offerId: `o${Date.now()}`,
        supplierTenantId: tenant.id,
        datasetId: dataset.id,
        title: 'Test',
        description: 'Test',
        pricePerHour: 100,
        jurisdiction: 'US',
        scopeHours: 24,
        language: 'en-US',
      }
    });
    console.log('✅ AccessOffer OK');

    // Test 2: AuditLog
    console.log('Test 2: AuditLog...');
    const audit = await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'TEST',
        resourceType: 'DATASET',
        resourceId: dataset.id,
      }
    });
    console.log('✅ AuditLog OK');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.accessOffer.deleteMany({ where: { supplierTenantId: tenant.id } });
    await prisma.dataset.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    
    console.log('\n✅ TODOS OS TESTES PASSARAM!');
    process.exit(0);
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

test();
