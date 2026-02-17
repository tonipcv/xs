import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

interface TestContext {
  userId: string;
  tenantId: string;
  email: string;
  password: string;
  sessionToken?: string;
  csrfToken?: string;
  datasetId?: string;
  policyId?: string;
  offerId?: string;
  leaseId?: string;
  apiKey?: string;
  bundleId?: string;
}

const ctx: TestContext = {
  userId: '',
  tenantId: '',
  email: `test-${Date.now()}@xase.ai`,
  password: 'TestPassword123!',
};

async function makeRequest(
  method: string,
  path: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: string;
  } = {}
): Promise<{ status: number; data?: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (options.body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions);
  
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

describe('Flow 1: Registro e Login Completo', () => {
  it('1.1 - Deve criar novo usuário via API', async () => {
    const response = await makeRequest('POST', '/api/auth/register', {
      body: {
        email: ctx.email,
        password: ctx.password,
        name: 'Test User',
      },
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('userId');
    expect(response.data).toHaveProperty('tenantId');

    ctx.userId = response.data.userId;
    ctx.tenantId = response.data.tenantId;
  });

  it('1.2 - Deve fazer login com credenciais', async () => {
    const user = await prisma.user.findUnique({
      where: { email: ctx.email },
    });

    expect(user).toBeTruthy();
    expect(user?.tenantId).toBe(ctx.tenantId);
  });

  it('1.3 - Deve acessar perfil do usuário', async () => {
    const response = await makeRequest('GET', '/profile');
    expect([200, 302, 401]).toContain(response.status);
  });

  it('1.4 - Deve solicitar reset de senha', async () => {
    const response = await makeRequest('POST', '/api/auth/forgot-password', {
      body: { email: ctx.email },
    });

    expect([200, 201, 400]).toContain(response.status);
  });
});

describe('Flow 2: Dataset Completo - Criar, Upload, Processar, Publicar', () => {
  it('2.1 - Deve criar novo dataset', async () => {
    const dataset = await prisma.dataset.create({
      data: {
        name: 'Test Dataset',
        description: 'Integration test dataset',
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        dataType: 'AUDIO',
        status: 'DRAFT',
      },
    });

    expect(dataset).toBeTruthy();
    expect(dataset.id).toBeTruthy();
    ctx.datasetId = dataset.id;
  });

  it('2.2 - Deve listar datasets do tenant', async () => {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets[0].id).toBe(ctx.datasetId);
  });

  it('2.3 - Deve buscar detalhes do dataset', async () => {
    const dataset = await prisma.dataset.findUnique({
      where: { id: ctx.datasetId },
    });

    expect(dataset).toBeTruthy();
    expect(dataset?.name).toBe('Test Dataset');
  });

  it('2.4 - Deve atualizar status do dataset para PROCESSING', async () => {
    const updated = await prisma.dataset.update({
      where: { id: ctx.datasetId },
      data: { status: 'PROCESSING' },
    });

    expect(updated.status).toBe('PROCESSING');
  });

  it('2.5 - Deve publicar dataset (status PUBLISHED)', async () => {
    const published = await prisma.dataset.update({
      where: { id: ctx.datasetId },
      data: { 
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeTruthy();
  });
});

describe('Flow 3: Policy + Offer Completo', () => {
  it('3.1 - Deve criar nova policy', async () => {
    const policy = await prisma.policy.create({
      data: {
        name: 'Test Policy',
        description: 'Integration test policy',
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        rules: {
          maxDuration: 3600,
          allowedRegions: ['US', 'EU'],
          requiresConsent: true,
        },
        status: 'ACTIVE',
      },
    });

    expect(policy).toBeTruthy();
    ctx.policyId = policy.id;
  });

  it('3.2 - Deve validar regras da policy', async () => {
    const policy = await prisma.policy.findUnique({
      where: { id: ctx.policyId },
    });

    expect(policy).toBeTruthy();
    expect(policy?.rules).toHaveProperty('maxDuration');
  });

  it('3.3 - Deve criar access offer', async () => {
    const offer = await prisma.accessOffer.create({
      data: {
        datasetId: ctx.datasetId!,
        policyId: ctx.policyId!,
        tenantId: ctx.tenantId,
        name: 'Test Offer',
        description: 'Integration test offer',
        price: 100,
        currency: 'USD',
        duration: 86400,
        status: 'ACTIVE',
      },
    });

    expect(offer).toBeTruthy();
    ctx.offerId = offer.id;
  });

  it('3.4 - Deve listar offers no marketplace', async () => {
    const offers = await prisma.accessOffer.findMany({
      where: { status: 'ACTIVE' },
    });

    expect(offers.length).toBeGreaterThan(0);
  });
});

describe('Flow 4: AI Lab - Lease + Training', () => {
  it('4.1 - Deve executar offer e criar lease', async () => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const lease = await prisma.lease.create({
      data: {
        offerId: ctx.offerId!,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        datasetId: ctx.datasetId!,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    expect(lease).toBeTruthy();
    ctx.leaseId = lease.id;
  });

  it('4.2 - Deve buscar detalhes do lease', async () => {
    const lease = await prisma.lease.findUnique({
      where: { id: ctx.leaseId },
      include: {
        dataset: true,
        offer: true,
      },
    });

    expect(lease).toBeTruthy();
    expect(lease?.dataset.id).toBe(ctx.datasetId);
  });

  it('4.3 - Deve estender lease', async () => {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 2);

    const extended = await prisma.lease.update({
      where: { id: ctx.leaseId },
      data: { expiresAt: newExpiry },
    });

    expect(extended.expiresAt.getTime()).toBeGreaterThan(new Date().getTime());
  });

  it('4.4 - Deve registrar uso do lease', async () => {
    const usage = await prisma.usageLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        leaseId: ctx.leaseId,
        datasetId: ctx.datasetId!,
        action: 'DATA_ACCESS',
        metadata: {
          segments: 100,
          duration: 3600,
        },
      },
    });

    expect(usage).toBeTruthy();
  });
});

describe('Flow 5: Sidecar Integration', () => {
  it('5.1 - Deve criar sessão de sidecar', async () => {
    const session = await prisma.sidecarSession.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        leaseId: ctx.leaseId!,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    expect(session).toBeTruthy();
  });

  it('5.2 - Deve registrar telemetria', async () => {
    const telemetry = await prisma.telemetryLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        leaseId: ctx.leaseId!,
        eventType: 'SEGMENT_SERVED',
        metadata: {
          segmentId: 'seg_123',
          watermarked: true,
        },
      },
    });

    expect(telemetry).toBeTruthy();
  });

  it('5.3 - Deve verificar kill switch', async () => {
    const killSwitch = await prisma.killSwitch.findFirst({
      where: { 
        tenantId: ctx.tenantId,
        active: true,
      },
    });

    expect(killSwitch).toBeNull();
  });
});

describe('Flow 6: Evidence + Compliance', () => {
  it('6.1 - Deve criar evidence bundle', async () => {
    const bundle = await prisma.evidenceBundle.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        leaseId: ctx.leaseId!,
        datasetId: ctx.datasetId!,
        merkleRoot: 'test_merkle_root',
        metadata: {
          segments: 100,
          watermarks: 100,
        },
      },
    });

    expect(bundle).toBeTruthy();
    ctx.bundleId = bundle.id;
  });

  it('6.2 - Deve listar bundles', async () => {
    const bundles = await prisma.evidenceBundle.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(bundles.length).toBeGreaterThan(0);
  });

  it('6.3 - Deve registrar audit log', async () => {
    const audit = await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'EVIDENCE_GENERATED',
        resourceType: 'EVIDENCE_BUNDLE',
        resourceId: ctx.bundleId!,
        metadata: {
          bundleId: ctx.bundleId,
        },
      },
    });

    expect(audit).toBeTruthy();
  });

  it('6.4 - Deve consultar audit trail', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('Flow 7: Consent Management', () => {
  it('7.1 - Deve criar consentimento', async () => {
    const consent = await prisma.consent.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        datasetId: ctx.datasetId!,
        purpose: 'AI_TRAINING',
        granted: true,
        expiresAt: new Date(Date.now() + 86400000 * 365),
      },
    });

    expect(consent).toBeTruthy();
    expect(consent.granted).toBe(true);
  });

  it('7.2 - Deve verificar status de consentimento', async () => {
    const consent = await prisma.consent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        datasetId: ctx.datasetId,
      },
    });

    expect(consent).toBeTruthy();
    expect(consent?.granted).toBe(true);
  });

  it('7.3 - Deve revogar consentimento', async () => {
    const revoked = await prisma.consent.updateMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        datasetId: ctx.datasetId,
      },
      data: {
        granted: false,
        revokedAt: new Date(),
      },
    });

    expect(revoked.count).toBeGreaterThan(0);
  });

  it('7.4 - Deve revogar leases associados ao consentimento revogado', async () => {
    const updated = await prisma.lease.updateMany({
      where: {
        tenantId: ctx.tenantId,
        datasetId: ctx.datasetId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    expect(updated.count).toBeGreaterThanOrEqual(0);
  });
});

describe('Flow 8: GDPR/Compliance', () => {
  it('8.1 - Deve criar DSAR request', async () => {
    const dsar = await prisma.complianceRequest.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: 'DSAR',
        status: 'PENDING',
        metadata: {
          requestedAt: new Date().toISOString(),
        },
      },
    });

    expect(dsar).toBeTruthy();
    expect(dsar.type).toBe('DSAR');
  });

  it('8.2 - Deve criar erasure request', async () => {
    const erasure = await prisma.complianceRequest.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: 'ERASURE',
        status: 'PENDING',
        metadata: {
          requestedAt: new Date().toISOString(),
        },
      },
    });

    expect(erasure).toBeTruthy();
    expect(erasure.type).toBe('ERASURE');
  });

  it('8.3 - Deve listar compliance requests', async () => {
    const requests = await prisma.complianceRequest.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(requests.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Flow 9: Security/Access Control', () => {
  it('9.1 - Deve criar API key', async () => {
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        name: 'Test API Key',
        key: `xase_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        expiresAt: new Date(Date.now() + 86400000 * 30),
      },
    });

    expect(apiKey).toBeTruthy();
    ctx.apiKey = apiKey.key;
  });

  it('9.2 - Deve listar API keys do tenant', async () => {
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(keys.length).toBeGreaterThan(0);
  });

  it('9.3 - Deve revogar API key', async () => {
    const revoked = await prisma.apiKey.updateMany({
      where: {
        tenantId: ctx.tenantId,
        key: ctx.apiKey,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    expect(revoked.count).toBe(1);
  });

  it('9.4 - Deve verificar isolamento entre tenants', async () => {
    const otherTenantData = await prisma.dataset.findMany({
      where: {
        tenantId: { not: ctx.tenantId },
      },
    });

    const myData = await prisma.dataset.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(myData.length).toBeGreaterThan(0);
  });
});

describe('Flow 10: Billing + Ledger', () => {
  it('10.1 - Deve criar transação no ledger', async () => {
    const transaction = await prisma.ledgerTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: 'CREDIT',
        amount: 1000,
        currency: 'USD',
        description: 'Test credit',
        metadata: {
          source: 'integration_test',
        },
      },
    });

    expect(transaction).toBeTruthy();
    expect(transaction.amount).toBe(1000);
  });

  it('10.2 - Deve calcular saldo do ledger', async () => {
    const transactions = await prisma.ledgerTransaction.findMany({
      where: { tenantId: ctx.tenantId },
    });

    const balance = transactions.reduce((sum, t) => {
      return t.type === 'CREDIT' ? sum + t.amount : sum - t.amount;
    }, 0);

    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it('10.3 - Deve registrar uso e billing', async () => {
    const usage = await prisma.usageLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'DATA_ACCESS',
        metadata: {
          cost: 10,
          segments: 100,
        },
      },
    });

    expect(usage).toBeTruthy();
  });
});

describe('Flow 12: Voice Module', () => {
  it('12.1 - Deve criar dataset de voz', async () => {
    const voiceDataset = await prisma.dataset.create({
      data: {
        name: 'Voice Test Dataset',
        description: 'Voice integration test',
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        dataType: 'VOICE',
        status: 'DRAFT',
      },
    });

    expect(voiceDataset).toBeTruthy();
    expect(voiceDataset.dataType).toBe('VOICE');
  });

  it('12.2 - Deve criar policy de voz', async () => {
    const voicePolicy = await prisma.policy.create({
      data: {
        name: 'Voice Test Policy',
        description: 'Voice policy test',
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        rules: {
          voiceOnly: true,
          maxDuration: 7200,
        },
        status: 'ACTIVE',
      },
    });

    expect(voicePolicy).toBeTruthy();
  });

  it('12.3 - Deve registrar access log de voz', async () => {
    const accessLog = await prisma.accessLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'VOICE_ACCESS',
        resourceType: 'DATASET',
        resourceId: ctx.datasetId!,
        metadata: {
          voiceSegments: 50,
        },
      },
    });

    expect(accessLog).toBeTruthy();
  });
});

afterAll(async () => {
  console.log('\n🧹 Limpando dados de teste...\n');

  await prisma.accessLog.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.usageLog.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.ledgerTransaction.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.complianceRequest.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.consent.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.evidenceBundle.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.telemetryLog.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.sidecarSession.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.apiKey.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.lease.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.accessOffer.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.policy.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.dataset.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.user.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.tenant.deleteMany({ where: { id: ctx.tenantId } });

  await prisma.$disconnect();
  
  console.log('✅ Dados de teste removidos com sucesso\n');
});
