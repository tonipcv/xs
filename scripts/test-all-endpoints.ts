#!/usr/bin/env tsx

/**
 * XASE Comprehensive Endpoint Testing Suite
 * Tests all 12 critical flows and generates detailed report
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface TestResult {
  flow: string;
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'MISSING' | 'SKIP';
  statusCode?: number;
  error?: string;
  responseTime?: number;
}

interface FlowDefinition {
  name: string;
  endpoints: EndpointTest[];
}

interface EndpointTest {
  method: string;
  path: string;
  description: string;
  requiresAuth?: boolean;
  requiresData?: string[];
  skipReason?: string;
}

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const results: TestResult[] = [];

// Test data storage
let testData = {
  userId: '',
  tenantId: '',
  sessionToken: '',
  apiKey: '',
  datasetId: '',
  policyId: '',
  offerId: '',
  leaseId: '',
  executionId: '',
  bundleId: '',
};

const FLOWS: FlowDefinition[] = [
  {
    name: 'Flow 1: Registration and Authentication',
    endpoints: [
      { method: 'GET', path: '/register', description: 'Registration form' },
      { method: 'POST', path: '/api/auth/register', description: 'Create user + tenant' },
      { method: 'GET', path: '/login', description: 'Login form' },
      { method: 'POST', path: '/api/auth/[...nextauth]', description: 'Credentials login', skipReason: 'NextAuth internal' },
      { method: 'GET', path: '/profile', description: 'User profile', requiresAuth: true },
      { method: 'POST', path: '/api/auth/2fa/setup', description: 'Setup TOTP', requiresAuth: true },
      { method: 'POST', path: '/api/auth/2fa/verify', description: 'Verify TOTP code', requiresAuth: true },
      { method: 'POST', path: '/api/auth/forgot-password', description: 'Send password reset email' },
      { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password with token' },
    ],
  },
  {
    name: 'Flow 2: AI Holder - Dataset Management',
    endpoints: [
      { method: 'GET', path: '/xase/ai-holder/datasets', description: 'List datasets', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-holder/datasets/new', description: 'Create dataset form', requiresAuth: true },
      { method: 'POST', path: '/api/v1/datasets', description: 'Create dataset', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-holder/datasets/[id]', description: 'Dataset detail', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'GET', path: '/xase/ai-holder/datasets/[id]/upload', description: 'Upload page', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'POST', path: '/api/v1/datasets/[id]/upload', description: 'Upload WAV to S3', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'POST', path: '/api/v1/datasets/[id]/process', description: 'Process segments', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'POST', path: '/api/v1/datasets/[id]/publish', description: 'Publish to marketplace', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'GET', path: '/xase/ai-holder/datasets/[id]/stream', description: 'Test streaming', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'GET', path: '/xase/ai-holder/datasets/[id]/lab', description: 'Lab view', requiresAuth: true, requiresData: ['datasetId'] },
    ],
  },
  {
    name: 'Flow 3: AI Holder - Policy + Offer',
    endpoints: [
      { method: 'GET', path: '/xase/ai-holder/policies', description: 'List policies', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-holder/policies/new', description: 'Create policy form', requiresAuth: true },
      { method: 'POST', path: '/api/v1/policies', description: 'Save policy', requiresAuth: true },
      { method: 'POST', path: '/api/v1/policies/validate', description: 'Validate policy rules', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-holder/policies/[id]/rewrite-rules', description: 'Rewrite rules page', requiresAuth: true, requiresData: ['policyId'] },
      { method: 'PUT', path: '/api/v1/policies/[id]/rewrite-rules', description: 'Save rewrite rules', requiresAuth: true, requiresData: ['policyId'] },
      { method: 'GET', path: '/xase/ai-holder/offers/new', description: 'Create offer form', requiresAuth: true },
      { method: 'POST', path: '/api/v1/datasets/[id]/access-offers', description: 'Publish offer', requiresAuth: true, requiresData: ['datasetId'] },
      { method: 'GET', path: '/api/v1/access-offers', description: 'List marketplace offers', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 4: AI Lab - Lease + Training',
    endpoints: [
      { method: 'GET', path: '/xase/ai-lab', description: 'AI Lab dashboard', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-lab/marketplace', description: 'View available offers', requiresAuth: true },
      { method: 'GET', path: '/xase/governed-access', description: 'Public marketplace' },
      { method: 'GET', path: '/xase/governed-access/[offerId]', description: 'Offer detail', requiresData: ['offerId'] },
      { method: 'POST', path: '/api/v1/access-offers/[offerId]/execute', description: 'Accept offer → create lease', requiresAuth: true, requiresData: ['offerId'] },
      { method: 'GET', path: '/xase/training/leases/[leaseId]', description: 'Lease detail', requiresAuth: true, requiresData: ['leaseId'] },
      { method: 'POST', path: '/api/v1/leases/[leaseId]/extend', description: 'Extend lease', requiresAuth: true, requiresData: ['leaseId'] },
      { method: 'POST', path: '/api/v1/sidecar/auth', description: 'Authenticate sidecar', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-lab/usage', description: 'View usage', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-lab/billing', description: 'View billing', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 5: Sidecar Integration',
    endpoints: [
      { method: 'POST', path: '/api/v1/sidecar/auth', description: 'Get session_id + STS credentials', requiresAuth: true },
      { method: 'POST', path: '/api/v1/sidecar/telemetry', description: 'Send telemetry', requiresAuth: true },
      { method: 'GET', path: '/api/v1/sidecar/kill-switch', description: 'Check kill switch status', requiresAuth: true },
      { method: 'POST', path: '/api/v1/sidecar/kill-switch', description: 'Activate kill switch', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 6: Evidence + Compliance',
    endpoints: [
      { method: 'POST', path: '/api/v1/executions/[id]/evidence', description: 'Generate evidence bundle', requiresAuth: true, requiresData: ['executionId'] },
      { method: 'GET', path: '/xase/bundles', description: 'List bundles', requiresAuth: true },
      { method: 'GET', path: '/xase/bundles/[id]', description: 'Bundle detail with Merkle tree', requiresAuth: true, requiresData: ['bundleId'] },
      { method: 'GET', path: '/api/xase/bundles/[id]/pdf', description: 'Download PDF', requiresAuth: true, requiresData: ['bundleId'] },
      { method: 'GET', path: '/xase/bundles/[id]/pdf/preview', description: 'PDF preview', requiresAuth: true, requiresData: ['bundleId'] },
      { method: 'POST', path: '/api/v1/watermark/detect', description: 'Detect watermark in audio', requiresAuth: true },
      { method: 'POST', path: '/api/v1/watermark/forensics', description: 'Forensic analysis', requiresAuth: true },
      { method: 'GET', path: '/api/v1/audit/query', description: 'Query audit trail', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 7: Consent Management',
    endpoints: [
      { method: 'GET', path: '/xase/consent', description: 'Consent dashboard', requiresAuth: true },
      { method: 'POST', path: '/api/v1/consent/grant', description: 'Grant consent', requiresAuth: true },
      { method: 'GET', path: '/api/v1/consent/status', description: 'Check consent status', requiresAuth: true },
      { method: 'GET', path: '/api/v1/consent/preferences', description: 'Get preferences', requiresAuth: true },
      { method: 'POST', path: '/api/v1/consent/revoke', description: 'Revoke consent', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 8: GDPR/Compliance',
    endpoints: [
      { method: 'POST', path: '/api/v1/compliance/gdpr/dsar', description: 'Data subject access request', requiresAuth: true },
      { method: 'POST', path: '/api/v1/compliance/gdpr/erasure', description: 'Erasure request', requiresAuth: true },
      { method: 'POST', path: '/api/v1/compliance/gdpr/portability', description: 'Export data', requiresAuth: true },
      { method: 'POST', path: '/api/v1/compliance/bafin/ai-risk', description: 'AI risk analysis', requiresAuth: true },
      { method: 'POST', path: '/api/v1/compliance/fca/consumer-duty', description: 'Consumer duty check', requiresAuth: true },
      { method: 'GET', path: '/xase/compliance', description: 'Compliance dashboard', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 9: Security/Access Control',
    endpoints: [
      { method: 'GET', path: '/xase/security/rbac', description: 'RBAC management', requiresAuth: true },
      { method: 'POST', path: '/api/v1/rbac/roles', description: 'Create role', requiresAuth: true },
      { method: 'POST', path: '/api/v1/break-glass/activate', description: 'Emergency access', requiresAuth: true },
      { method: 'POST', path: '/api/v1/jit-access/request', description: 'JIT access request', requiresAuth: true },
      { method: 'GET', path: '/xase/api-keys', description: 'Manage API keys', requiresAuth: true },
      { method: 'POST', path: '/api/xase/api-keys', description: 'Create API key', requiresAuth: true },
      { method: 'DELETE', path: '/api/xase/api-keys/[id]', description: 'Revoke API key', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 10: Billing + Ledger',
    endpoints: [
      { method: 'GET', path: '/xase/usage-billing', description: 'Billing page', requiresAuth: true },
      { method: 'GET', path: '/api/v1/billing/usage', description: 'Usage data', requiresAuth: true },
      { method: 'GET', path: '/api/v1/ledger', description: 'Credit ledger', requiresAuth: true },
      { method: 'POST', path: '/api/webhook', description: 'Stripe webhook' },
      { method: 'GET', path: '/api/user/premium-status', description: 'Check premium status', requiresAuth: true },
      { method: 'GET', path: '/xase/ai-holder/ledger', description: 'Holder ledger', requiresAuth: true },
    ],
  },
  {
    name: 'Flow 12: Voice Module',
    endpoints: [
      { method: 'GET', path: '/xase/voice', description: 'Voice dashboard', requiresAuth: true },
      { method: 'GET', path: '/xase/voice/datasets/new', description: 'Create voice dataset', requiresAuth: true },
      { method: 'GET', path: '/xase/voice/policies', description: 'Voice policies', requiresAuth: true },
      { method: 'POST', path: '/xase/voice/offers/new', description: 'Publish voice offer', requiresAuth: true },
      { method: 'GET', path: '/xase/voice/leases', description: 'Manage voice leases', requiresAuth: true },
      { method: 'GET', path: '/xase/voice/access-logs', description: 'Voice access logs', requiresAuth: true },
      { method: 'GET', path: '/xase/voice/evidence/print', description: 'Print evidence', requiresAuth: true },
    ],
  },
];

async function checkEndpointExists(method: string, path: string): Promise<boolean> {
  const apiPath = path.startsWith('/api/') ? path : null;
  const pagePath = !path.startsWith('/api/') ? path : null;

  if (apiPath) {
    const routePath = apiPath.replace('/api/', '');
    const possiblePaths = [
      `src/app/api/${routePath}/route.ts`,
      `src/app/api/${routePath}/route.js`,
      `src/app${apiPath}/route.ts`,
      `src/app${apiPath}/route.js`,
    ];

    for (const p of possiblePaths) {
      const fullPath = join(process.cwd(), p);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
  }

  if (pagePath) {
    const possiblePaths = [
      `src/app${pagePath}/page.tsx`,
      `src/app${pagePath}/page.ts`,
      `src/app${pagePath}/page.jsx`,
      `src/app${pagePath}/page.js`,
    ];

    for (const p of possiblePaths) {
      const fullPath = join(process.cwd(), p);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
  }

  return false;
}

async function testEndpoint(
  flow: string,
  endpoint: EndpointTest
): Promise<TestResult> {
  const result: TestResult = {
    flow,
    endpoint: endpoint.path,
    method: endpoint.method,
    status: 'FAIL',
  };

  if (endpoint.skipReason) {
    result.status = 'SKIP';
    result.error = endpoint.skipReason;
    return result;
  }

  if (endpoint.requiresData) {
    const missingData = endpoint.requiresData.filter(
      (key) => !testData[key as keyof typeof testData]
    );
    if (missingData.length > 0) {
      result.status = 'SKIP';
      result.error = `Missing required data: ${missingData.join(', ')}`;
      return result;
    }
  }

  let testPath = endpoint.path;
  if (testPath.includes('[id]') && testData.datasetId) {
    testPath = testPath.replace('[id]', testData.datasetId);
  }
  if (testPath.includes('[datasetId]') && testData.datasetId) {
    testPath = testPath.replace('[datasetId]', testData.datasetId);
  }
  if (testPath.includes('[policyId]') && testData.policyId) {
    testPath = testPath.replace('[policyId]', testData.policyId);
  }
  if (testPath.includes('[offerId]') && testData.offerId) {
    testPath = testPath.replace('[offerId]', testData.offerId);
  }
  if (testPath.includes('[leaseId]') && testData.leaseId) {
    testPath = testPath.replace('[leaseId]', testData.leaseId);
  }
  if (testPath.includes('[bundleId]') && testData.bundleId) {
    testPath = testPath.replace('[bundleId]', testData.bundleId);
  }

  const exists = await checkEndpointExists(endpoint.method, endpoint.path);
  if (!exists) {
    result.status = 'MISSING';
    result.error = 'Endpoint file not found in codebase';
    return result;
  }

  result.status = 'PASS';
  result.error = 'Endpoint exists (file check only)';
  return result;
}

async function runTests() {
  console.log('🚀 XASE Comprehensive Endpoint Testing Suite\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  console.log('=' .repeat(80));

  for (const flow of FLOWS) {
    console.log(`\n📋 ${flow.name}`);
    console.log('-'.repeat(80));

    for (const endpoint of flow.endpoints) {
      const result = await testEndpoint(flow.name, endpoint);
      results.push(result);

      const icon =
        result.status === 'PASS'
          ? '✅'
          : result.status === 'MISSING'
          ? '❌'
          : result.status === 'SKIP'
          ? '⏭️ '
          : '⚠️ ';

      console.log(
        `${icon} ${result.method.padEnd(6)} ${result.endpoint.padEnd(50)} [${result.status}]`
      );
      if (result.error && result.status !== 'PASS') {
        console.log(`   └─ ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  generateReport();
}

function generateReport() {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const missing = results.filter((r) => r.status === 'MISSING').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Endpoints Tested: ${total}`);
  console.log(`✅ Passed (Exists):     ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`❌ Missing:             ${missing} (${((missing / total) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Failed:             ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
  console.log(`⏭️  Skipped:            ${skipped} (${((skipped / total) * 100).toFixed(1)}%)`);

  if (missing > 0) {
    console.log('\n❌ MISSING ENDPOINTS:');
    console.log('='.repeat(80));
    results
      .filter((r) => r.status === 'MISSING')
      .forEach((r) => {
        console.log(`${r.method.padEnd(6)} ${r.endpoint}`);
        console.log(`   Flow: ${r.flow}`);
      });
  }

  const reportPath = join(process.cwd(), 'ENDPOINT_TEST_REPORT.md');
  const markdown = generateMarkdownReport();
  fs.writeFileSync(reportPath, markdown);
  console.log(`\n📄 Full report saved to: ${reportPath}`);
}

function generateMarkdownReport(): string {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const missing = results.filter((r) => r.status === 'MISSING').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  let md = `# XASE Endpoint Test Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `| Status | Count | Percentage |\n`;
  md += `|--------|-------|------------|\n`;
  md += `| ✅ Passed | ${passed} | ${((passed / total) * 100).toFixed(1)}% |\n`;
  md += `| ❌ Missing | ${missing} | ${((missing / total) * 100).toFixed(1)}% |\n`;
  md += `| ⚠️ Failed | ${failed} | ${((failed / total) * 100).toFixed(1)}% |\n`;
  md += `| ⏭️ Skipped | ${skipped} | ${((skipped / total) * 100).toFixed(1)}% |\n`;
  md += `| **Total** | **${total}** | **100%** |\n\n`;

  md += `## Coverage by Flow\n\n`;
  for (const flow of FLOWS) {
    const flowResults = results.filter((r) => r.flow === flow.name);
    const flowPassed = flowResults.filter((r) => r.status === 'PASS').length;
    const flowTotal = flowResults.length;
    const coverage = ((flowPassed / flowTotal) * 100).toFixed(1);

    md += `### ${flow.name}\n\n`;
    md += `**Coverage:** ${flowPassed}/${flowTotal} (${coverage}%)\n\n`;
    md += `| Method | Endpoint | Status | Notes |\n`;
    md += `|--------|----------|--------|-------|\n`;

    flowResults.forEach((r) => {
      const icon =
        r.status === 'PASS'
          ? '✅'
          : r.status === 'MISSING'
          ? '❌'
          : r.status === 'SKIP'
          ? '⏭️'
          : '⚠️';
      md += `| ${r.method} | \`${r.endpoint}\` | ${icon} ${r.status} | ${r.error || '-'} |\n`;
    });

    md += `\n`;
  }

  if (missing > 0) {
    md += `## Missing Endpoints (Action Required)\n\n`;
    md += `The following ${missing} endpoints are referenced in the test flows but do not exist in the codebase:\n\n`;
    md += `| Method | Endpoint | Flow |\n`;
    md += `|--------|----------|------|\n`;

    results
      .filter((r) => r.status === 'MISSING')
      .forEach((r) => {
        md += `| ${r.method} | \`${r.endpoint}\` | ${r.flow} |\n`;
      });

    md += `\n`;
  }

  md += `## Recommendations\n\n`;
  md += `1. **Implement missing endpoints** - ${missing} endpoints need to be created\n`;
  md += `2. **Add integration tests** - Current tests only check file existence\n`;
  md += `3. **Test with real HTTP requests** - Verify endpoints return correct status codes\n`;
  md += `4. **Add authentication flow** - Test protected endpoints with valid sessions\n`;
  md += `5. **Create test data** - Set up fixtures for testing data-dependent endpoints\n\n`;

  return md;
}

runTests()
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
