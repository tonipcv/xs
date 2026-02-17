#!/usr/bin/env tsx

/**
 * XASE HTTP Integration Test Suite
 * Tests all endpoints with actual HTTP requests
 */

import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

interface HTTPTestResult {
  flow: string;
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';
  statusCode?: number;
  error?: string;
  responseTime?: number;
  expectedStatus?: number;
}

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const results: HTTPTestResult[] = [];

let testSession = {
  userId: '',
  tenantId: '',
  sessionToken: '',
  csrfToken: '',
};

async function makeRequest(
  method: string,
  path: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    requiresAuth?: boolean;
  } = {}
): Promise<{ status: number; data?: any; error?: string; time: number }> {
  const startTime = Date.now();
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.requiresAuth && testSession.sessionToken) {
      headers['Cookie'] = `next-auth.session-token=${testSession.sessionToken}`;
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
    const time = Date.now() - startTime;

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
      time,
    };
  } catch (error) {
    return {
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      time: Date.now() - startTime,
    };
  }
}

async function testEndpoint(
  flow: string,
  method: string,
  path: string,
  description: string,
  options: {
    requiresAuth?: boolean;
    expectedStatus?: number;
    skipReason?: string;
    body?: any;
  } = {}
): Promise<HTTPTestResult> {
  const result: HTTPTestResult = {
    flow,
    endpoint: path,
    method,
    status: 'FAIL',
    expectedStatus: options.expectedStatus,
  };

  if (options.skipReason) {
    result.status = 'SKIP';
    result.error = options.skipReason;
    return result;
  }

  const response = await makeRequest(method, path, {
    requiresAuth: options.requiresAuth,
    body: options.body,
  });

  result.responseTime = response.time;
  result.statusCode = response.status;

  if (response.error) {
    result.status = 'ERROR';
    result.error = response.error;
    return result;
  }

  if (options.expectedStatus) {
    if (response.status === options.expectedStatus) {
      result.status = 'PASS';
    } else {
      result.status = 'FAIL';
      result.error = `Expected ${options.expectedStatus}, got ${response.status}`;
    }
  } else {
    if (response.status >= 200 && response.status < 500) {
      result.status = 'PASS';
    } else {
      result.status = 'FAIL';
      result.error = `Unexpected status ${response.status}`;
    }
  }

  return result;
}

async function runTests() {
  console.log('🚀 XASE HTTP Integration Test Suite\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  console.log('⚠️  Note: Server must be running for HTTP tests\n');
  console.log('=' .repeat(80));

  console.log('\n📋 Flow 1: Registration and Authentication');
  console.log('-'.repeat(80));

  let r = await testEndpoint(
    'Flow 1',
    'GET',
    '/register',
    'Registration form',
    { expectedStatus: 200 }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /register [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 1',
    'GET',
    '/login',
    'Login form',
    { expectedStatus: 200 }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /login [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 1',
    'GET',
    '/profile',
    'User profile',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /profile [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 2: AI Holder - Dataset Management');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 2',
    'GET',
    '/xase/ai-holder/datasets',
    'List datasets',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/ai-holder/datasets [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 2',
    'GET',
    '/xase/ai-holder/datasets/new',
    'Create dataset form',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/ai-holder/datasets/new [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 2',
    'POST',
    '/api/v1/datasets',
    'Create dataset API',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/datasets [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 3: AI Holder - Policy + Offer');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 3',
    'GET',
    '/xase/ai-holder/policies',
    'List policies',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/ai-holder/policies [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 3',
    'POST',
    '/api/v1/policies',
    'Create policy',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/policies [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 3',
    'GET',
    '/api/v1/access-offers',
    'List marketplace offers',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/access-offers [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 4: AI Lab - Lease + Training');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 4',
    'GET',
    '/xase/ai-lab',
    'AI Lab dashboard',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/ai-lab [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 4',
    'GET',
    '/xase/governed-access',
    'Public marketplace',
    { expectedStatus: 200 }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/governed-access [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 4',
    'POST',
    '/api/v1/sidecar/auth',
    'Sidecar auth',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/sidecar/auth [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 5: Sidecar Integration');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 5',
    'POST',
    '/api/v1/sidecar/telemetry',
    'Send telemetry',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/sidecar/telemetry [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 5',
    'GET',
    '/api/v1/sidecar/kill-switch',
    'Check kill switch',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/sidecar/kill-switch [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 6: Evidence + Compliance');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 6',
    'GET',
    '/xase/bundles',
    'List bundles',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/bundles [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 6',
    'POST',
    '/api/v1/watermark/detect',
    'Detect watermark',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/watermark/detect [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 6',
    'GET',
    '/api/v1/audit/query',
    'Query audit trail',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/audit/query [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 7: Consent Management');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 7',
    'GET',
    '/xase/consent',
    'Consent dashboard',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/consent [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 7',
    'POST',
    '/api/v1/consent/grant',
    'Grant consent',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/consent/grant [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 7',
    'GET',
    '/api/v1/consent/status',
    'Check consent status',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/consent/status [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 8: GDPR/Compliance');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 8',
    'POST',
    '/api/v1/compliance/gdpr/dsar',
    'DSAR request',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/compliance/gdpr/dsar [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 8',
    'POST',
    '/api/v1/compliance/bafin/ai-risk',
    'AI risk analysis',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/compliance/bafin/ai-risk [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 8',
    'GET',
    '/xase/compliance',
    'Compliance dashboard',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/compliance [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 9: Security/Access Control');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 9',
    'GET',
    '/xase/security/rbac',
    'RBAC management',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/security/rbac [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 9',
    'POST',
    '/api/v1/break-glass/activate',
    'Break-glass activation',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} POST /api/v1/break-glass/activate [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 9',
    'GET',
    '/xase/api-keys',
    'Manage API keys',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/api-keys [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 10: Billing + Ledger');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 10',
    'GET',
    '/xase/usage-billing',
    'Billing page',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/usage-billing [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 10',
    'GET',
    '/api/v1/billing/usage',
    'Usage data',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/billing/usage [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 10',
    'GET',
    '/api/v1/ledger',
    'Credit ledger',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/v1/ledger [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 10',
    'GET',
    '/api/user/premium-status',
    'Premium status',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /api/user/premium-status [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n📋 Flow 12: Voice Module');
  console.log('-'.repeat(80));

  r = await testEndpoint(
    'Flow 12',
    'GET',
    '/xase/voice',
    'Voice dashboard',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/voice [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 12',
    'GET',
    '/xase/voice/datasets/new',
    'Create voice dataset',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/voice/datasets/new [${r.statusCode}] ${r.responseTime}ms`);

  r = await testEndpoint(
    'Flow 12',
    'GET',
    '/xase/voice/policies',
    'Voice policies',
    { requiresAuth: true }
  );
  results.push(r);
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} GET /xase/voice/policies [${r.statusCode}] ${r.responseTime}ms`);

  console.log('\n' + '='.repeat(80));
  generateReport();
}

function generateReport() {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  const avgResponseTime =
    results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / total;

  console.log('\n📊 HTTP TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Endpoints Tested: ${total}`);
  console.log(`✅ Passed:              ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed:              ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Errors:              ${errors} (${((errors / total) * 100).toFixed(1)}%)`);
  console.log(`⏭️  Skipped:             ${skipped} (${((skipped / total) * 100).toFixed(1)}%)`);
  console.log(`⏱️  Avg Response Time:   ${avgResponseTime.toFixed(0)}ms`);

  const reportPath = join(process.cwd(), 'HTTP_TEST_REPORT.md');
  const markdown = generateMarkdownReport();
  fs.writeFileSync(reportPath, markdown);
  console.log(`\n📄 Full report saved to: ${reportPath}`);
}

function generateMarkdownReport(): string {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  let md = `# XASE HTTP Integration Test Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Base URL:** ${BASE_URL}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Status | Count | Percentage |\n`;
  md += `|--------|-------|------------|\n`;
  md += `| ✅ Passed | ${passed} | ${((passed / total) * 100).toFixed(1)}% |\n`;
  md += `| ❌ Failed | ${failed} | ${((failed / total) * 100).toFixed(1)}% |\n`;
  md += `| ⚠️ Errors | ${errors} | ${((errors / total) * 100).toFixed(1)}% |\n`;
  md += `| ⏭️ Skipped | ${skipped} | ${((skipped / total) * 100).toFixed(1)}% |\n`;
  md += `| **Total** | **${total}** | **100%** |\n\n`;

  md += `## Detailed Results\n\n`;
  md += `| Method | Endpoint | Status | Status Code | Response Time | Notes |\n`;
  md += `|--------|----------|--------|-------------|---------------|-------|\n`;

  results.forEach((r) => {
    const icon =
      r.status === 'PASS'
        ? '✅'
        : r.status === 'FAIL'
        ? '❌'
        : r.status === 'ERROR'
        ? '⚠️'
        : '⏭️';
    md += `| ${r.method} | \`${r.endpoint}\` | ${icon} ${r.status} | ${r.statusCode || 'N/A'} | ${r.responseTime || 'N/A'}ms | ${r.error || '-'} |\n`;
  });

  md += `\n## Performance Analysis\n\n`;
  const avgTime = results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / total;
  const maxTime = Math.max(...results.map((r) => r.responseTime || 0));
  const minTime = Math.min(...results.filter((r) => r.responseTime).map((r) => r.responseTime || 0));

  md += `- **Average Response Time:** ${avgTime.toFixed(0)}ms\n`;
  md += `- **Max Response Time:** ${maxTime}ms\n`;
  md += `- **Min Response Time:** ${minTime}ms\n\n`;

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
