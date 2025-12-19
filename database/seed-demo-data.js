/**
 * XASE CORE - Seed Demo Data
 * 
 * Preenche dados de demonstração para xppsalvador@gmail.com
 * Uso: node database/seed-demo-data.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Funções auxiliares
function hashObject(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function chainHash(previousHash, currentData) {
  const data = previousHash ? `${previousHash}${currentData}` : currentData;
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateTransactionId() {
  return `txn_${crypto.randomBytes(16).toString('hex')}`;
}

async function main() {
  console.log('🚀 Seeding demo data for xppsalvador@gmail.com...\n');

  // 1. Criar ou buscar tenant
  console.log('1. Creating tenant...');
  let tenant = await prisma.tenant.findFirst({
    where: { email: 'xppsalvador@gmail.com' },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Tenant',
        email: 'xppsalvador@gmail.com',
        companyName: 'Xase Demo Corp',
        status: 'ACTIVE',
        plan: 'enterprise',
      },
    });
    console.log(`✅ Tenant created: ${tenant.id}`);
  } else {
    console.log(`✅ Tenant exists: ${tenant.id}`);
  }

  // 2. Criar API Key
  console.log('\n2. Creating API Key...');
  const apiKeyValue = `xase_pk_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = await bcrypt.hash(apiKeyValue, 10);
  const keyPrefix = apiKeyValue.substring(0, 12);

  let apiKey = await prisma.apiKey.findFirst({
    where: { tenantId: tenant.id },
  });

  if (!apiKey) {
    apiKey = await prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: 'Demo API Key',
        keyHash,
        keyPrefix,
        permissions: 'ingest,export,verify',
        isActive: true,
        rateLimit: 10000,
      },
    });
    console.log(`✅ API Key created: ${keyPrefix}...`);
    console.log(`📝 Full key (save this): ${apiKeyValue}`);
  } else {
    console.log(`✅ API Key exists: ${apiKey.keyPrefix}...`);
  }

  // 3. Criar Decision Records
  console.log('\n3. Creating decision records...');
  const recordCount = 25;
  let previousHash = null;

  for (let i = 0; i < recordCount; i++) {
    const input = {
      user_id: 1000 + i,
      amount: Math.floor(Math.random() * 10000) + 1000,
      timestamp: new Date().toISOString(),
    };

    const output = {
      approved: Math.random() > 0.3,
      score: Math.random(),
      reason: Math.random() > 0.5 ? 'credit_score_high' : 'income_verified',
    };

    const context = {
      ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0',
    };

    const inputHash = hashObject(input);
    const outputHash = hashObject(output);
    const contextHash = hashObject(context);

    const combinedData = `${inputHash}${outputHash}${contextHash}`;
    const recordHash = chainHash(previousHash, combinedData);
    const transactionId = generateTransactionId();

    await prisma.decisionRecord.create({
      data: {
        tenantId: tenant.id,
        transactionId,
        inputHash,
        outputHash,
        contextHash,
        recordHash,
        previousHash,
        policyId: 'credit-approval-v1',
        policyVersion: '1.0.0',
        decisionType: 'CREDIT_APPROVAL',
        confidence: output.score,
        processingTime: Math.floor(Math.random() * 500) + 50,
        inputPayload: JSON.stringify(input),
        outputPayload: JSON.stringify(output),
        contextPayload: JSON.stringify(context),
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    previousHash = recordHash;

    if ((i + 1) % 5 === 0) {
      process.stdout.write(`✅ Created ${i + 1}/${recordCount} records\r`);
    }
  }
  console.log(`\n✅ Created ${recordCount} decision records`);

  // 4. Criar Checkpoints
  console.log('\n4. Creating checkpoints...');
  const checkpointCount = 3;

  for (let i = 0; i < checkpointCount; i++) {
    const lastRecord = await prisma.decisionRecord.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { timestamp: 'desc' },
      select: { recordHash: true },
    });

    const previousCheckpoint = await prisma.checkpointRecord.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { checkpointNumber: 'desc' },
      select: { checkpointId: true, checkpointHash: true, checkpointNumber: true },
    });

    const checkpointNumber = previousCheckpoint ? previousCheckpoint.checkpointNumber + 1 : 1;
    const checkpointId = `chk_${crypto.randomBytes(16).toString('hex')}`;

    const checkpointData = [
      previousCheckpoint?.checkpointHash || 'genesis',
      lastRecord?.recordHash || 'none',
      String(recordCount),
      new Date().toISOString(),
    ].join('|');

    const checkpointHash = crypto.createHash('sha256').update(checkpointData).digest('hex');

    // Mock KMS signature
    const signature = crypto.randomBytes(256).toString('base64');

    await prisma.checkpointRecord.create({
      data: {
        tenantId: tenant.id,
        checkpointId,
        checkpointType: 'PERIODIC',
        checkpointNumber,
        lastRecordHash: lastRecord?.recordHash || 'none',
        recordCount,
        checkpointHash,
        signature,
        signatureAlgo: 'RSA-SHA256',
        keyId: 'mock-key-demo',
        previousCheckpointId: previousCheckpoint?.checkpointId || null,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    console.log(`✅ Created checkpoint ${checkpointNumber}`);

    // Aguardar 1 segundo entre checkpoints
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 5. Criar Audit Logs
  console.log('\n5. Creating audit logs...');
  const auditActions = [
    { action: 'KEY_CREATED', resourceType: 'API_KEY', resourceId: apiKey.id },
    { action: 'CHECKPOINT_CREATED', resourceType: 'CHECKPOINT', resourceId: 'chk_001' },
    { action: 'EXPORT_CREATED', resourceType: 'DECISION_RECORD', resourceId: 'txn_001' },
    { action: 'PAYLOAD_ACCESSED', resourceType: 'DECISION_RECORD', resourceId: 'txn_002' },
  ];

  for (const audit of auditActions) {
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: audit.action,
        resourceType: audit.resourceType,
        resourceId: audit.resourceId,
        metadata: JSON.stringify({ demo: true }),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        status: 'SUCCESS',
      },
    });
  }
  console.log(`✅ Created ${auditActions.length} audit logs`);

  console.log('\n🎉 Demo data seeded successfully!\n');
  console.log('📊 Summary:');
  console.log(`   Tenant: ${tenant.email}`);
  console.log(`   Records: ${recordCount}`);
  console.log(`   Checkpoints: ${checkpointCount}`);
  console.log(`   Audit Logs: ${auditActions.length}`);
  console.log(`\n🔑 API Key: ${apiKeyValue}`);
  console.log('\n✅ Ready to demo!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
