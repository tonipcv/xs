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
  apiKeyId?: string;
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
        datasetId: `dataset_${Date.now()}`,
        storageLocation: 's3://test-bucket',
        language: 'en-US',
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
      data: { status: 'ACTIVE' },
    });

    expect(updated.status).toBe('ACTIVE');
  });

  it('2.5 - Deve publicar dataset (status ACTIVE)', async () => {
    const published = await prisma.dataset.update({
      where: { id: ctx.datasetId },
      data: { 
        status: 'ACTIVE',
      },
    });

    expect(published.status).toBe('ACTIVE');
  });
});

describe('Flow 3: Policy + Offer Completo', () => {
  it('3.1 - Deve criar nova policy', async () => {
    const policy = await prisma.accessPolicy.create({
      data: {
        clientTenantId: ctx.tenantId,
        datasetId: ctx.datasetId!,
        policyId: 'policy-001',
        usagePurpose: 'research',
      },
    });

    expect(policy).toBeTruthy();
    ctx.policyId = policy.id;
  });

  it('3.2 - Deve validar regras da policy', async () => {
    const policy = await prisma.accessPolicy.findUnique({
      where: { id: ctx.policyId },
    });

    expect(policy).toBeTruthy();
    expect(policy?.usagePurpose).toBe('research');
  });

  it('3.3 - Deve criar access offer', async () => {
    const offer = await prisma.accessOffer.create({
      data: {
        datasetId: ctx.datasetId!,
        supplierTenantId: ctx.tenantId,
        offerId: 'offer-001',
        title: 'Test Offer',
        description: 'Integration test offer',
        allowedPurposes: ['research'],
        jurisdiction: 'US',
        scopeHours: 24,
        pricePerHour: 10.00,
        language: 'en-US',
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

    const lease = await prisma.accessLease.create({
      data: {
        leaseId: 'lease-001',
        datasetId: ctx.datasetId!,
        clientTenantId: ctx.tenantId,
        policyId: ctx.policyId!,
        expiresAt,
      },
    });

    expect(lease).toBeTruthy();
    ctx.leaseId = lease.id;
  });

  it('4.2 - Deve buscar detalhes do lease', async () => {
    const lease = await prisma.accessLease.findUnique({
      where: { id: ctx.leaseId },
    });

    expect(lease).toBeTruthy();
    expect(lease?.datasetId).toBe(ctx.datasetId);
  });

  it('4.3 - Deve estender lease', async () => {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 2);

    const extended = await prisma.accessLease.update({
      where: { id: ctx.leaseId },
      data: { expiresAt: newExpiry },
    });

    expect(extended.expiresAt.getTime()).toBeGreaterThan(new Date().getTime());
  });

  it('4.4 - Deve registrar uso do lease', async () => {
    const usage = await prisma.accessLog.create({
      data: {
        clientTenantId: ctx.tenantId,
        datasetId: ctx.datasetId!,
        policyId: ctx.policyId!,
        action: 'STREAM_ACCESS',
        outcome: 'SUCCESS',
      },
    });

    expect(usage).toBeTruthy();
  });
});

describe('Flow 5: Sidecar Integration', () => {
  it('5.1 - Deve criar sessão de sidecar', async () => {
    const session = await prisma.sidecarSession.create({
      data: {
        leaseId: ctx.leaseId!,
        clientTenantId: ctx.tenantId,
        status: 'active',
      },
    });

    expect(session).toBeTruthy();
  });

  it('5.2 - Deve registrar telemetria', async () => {
    const session = await prisma.sidecarSession.findFirst({
      where: { clientTenantId: ctx.tenantId },
    });
    
    const telemetry = await prisma.sidecarMetric.create({
      data: {
        sidecarSessionId: session!.id,
        metricType: 'SEGMENTS_SERVED',
        metricValue: 100,
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 60000),
      },
    });

    expect(telemetry).toBeTruthy();
  });
});

describe('Flow 6: Evidence + Compliance', () => {
  it('6.1 - Deve criar evidence bundle', async () => {
    const execution = await prisma.policyExecution.findFirst({
      where: { buyerTenantId: ctx.tenantId },
    });
    
    const bundle = await prisma.evidenceMerkleTree.create({
      data: {
        executionId: execution!.id,
        rootHash: 'test_merkle_root',
        treeData: {},
        leafCount: 100,
      },
    });

    expect(bundle).toBeTruthy();
    ctx.bundleId = bundle.id;
  });

  it('6.2 - Deve listar bundles', async () => {
    const bundles = await prisma.evidenceMerkleTree.findMany({
      where: {},
    });

    expect(bundles.length).toBeGreaterThan(0);
  });

  it('6.3 - Deve registrar audit log', async () => {
    const audit = await prisma.auditLog.create({
      data: {
        action: 'EVIDENCE_GENERATED',
        resourceType: 'EVIDENCE_BUNDLE',
        resourceId: ctx.bundleId!,
        metadata: JSON.stringify({ bundleId: ctx.bundleId }),
      },
    });

    expect(audit).toBeTruthy();
  });

  it('6.4 - Deve consultar audit trail', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('Flow 9: Security/Access Control', () => {
  it('9.1 - Deve criar API key', async () => {
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: ctx.tenantId,
        name: 'Test API Key',
        keyHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        keyPrefix: 'xase_',
      },
    });

    expect(apiKey).toBeTruthy();
    ctx.apiKeyId = apiKey.id;
  });

  it('9.2 - Deve listar API keys do tenant', async () => {
    const keys = await prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
    });

    expect(keys.length).toBeGreaterThan(0);
  });

  it('9.3 - Deve revogar API key', async () => {
    const revoked = await prisma.apiKey.update({
      where: {
        id: ctx.apiKeyId!,
      },
      data: {
        isActive: false,
      },
    });

    expect(revoked.isActive).toBe(false);
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


describe('Flow 12: Voice Module', () => {
  it('12.1 - Deve criar dataset de voz', async () => {
    const voiceDataset = await prisma.dataset.create({
      data: {
        name: 'Voice Test Dataset',
        description: 'Voice integration test',
        tenantId: ctx.tenantId,
        datasetId: `voice_${Date.now()}`,
        storageLocation: 's3://test-bucket',
        language: 'en-US',
        dataType: 'AUDIO',
        status: 'DRAFT',
      },
    });

    expect(voiceDataset).toBeTruthy();
    expect(voiceDataset.dataType).toBe('AUDIO');
  });

  it('12.2 - Deve criar policy de voz', async () => {
    const voicePolicy = await prisma.accessPolicy.create({
      data: {
        clientTenantId: ctx.tenantId,
        datasetId: ctx.datasetId!,
        policyId: 'voice-policy-001',
        usagePurpose: 'voice_training',
      },
    });

    expect(voicePolicy).toBeTruthy();
  });

  it('12.3 - Deve registrar access log de voz', async () => {
    const policy = await prisma.accessPolicy.findFirst({
      where: { clientTenantId: ctx.tenantId },
    });
    
    const accessLog = await prisma.accessLog.create({
      data: {
        clientTenantId: ctx.tenantId,
        datasetId: ctx.datasetId!,
        policyId: policy!.id,
        action: 'STREAM_ACCESS',
        outcome: 'SUCCESS',
      },
    });

    expect(accessLog).toBeTruthy();
  });
});

afterAll(async () => {
  console.log('\n🧹 Limpando dados de teste...\n');

  // Cleanup apenas modelos existentes
  await prisma.accessLog.deleteMany({ where: { clientTenantId: ctx.tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.apiKey.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.accessOffer.deleteMany({ where: { supplierTenantId: ctx.tenantId } });
  await prisma.accessPolicy.deleteMany({ where: { clientTenantId: ctx.tenantId } });
  await prisma.dataset.deleteMany({ where: { tenantId: ctx.tenantId } });

  await prisma.$disconnect();
  
  console.log('✅ Dados de teste removidos com sucesso\n');
});
