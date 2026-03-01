/**
 * k6 Load Test - API Endpoints
 * Tests all critical API endpoints under load
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');
const requestCount = new Counter('requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';

// Test data
const testUsers = [];
const testDatasets = [];

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Warm up
    { duration: '3m', target: 50 },   // Ramp up
    { duration: '5m', target: 100 },  // Peak load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

export function setup() {
  console.log('Setting up load test...');
  
  // Create test data
  const setupData = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
  };
  
  return setupData;
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  // Test 1: Health Check
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`, { headers });
    
    check(res, {
      'health check status 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 2: List Datasets
  group('List Datasets', () => {
    const res = http.get(`${BASE_URL}/api/datasets`, { headers });
    
    check(res, {
      'list datasets status 200 or 401': (r) => [200, 401].includes(r.status),
      'list datasets response time < 500ms': (r) => r.timings.duration < 500,
      'list datasets returns array': (r) => {
        if (r.status === 200) {
          const body = JSON.parse(r.body);
          return Array.isArray(body.datasets) || Array.isArray(body);
        }
        return true;
      },
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 3: Create Dataset
  group('Create Dataset', () => {
    const payload = JSON.stringify({
      name: `Load Test Dataset ${__VU}-${__ITER}`,
      description: 'Dataset created during load testing',
      dataType: 'AUDIO',
      language: 'en-US',
    });

    const res = http.post(`${BASE_URL}/api/datasets`, payload, { headers });
    
    check(res, {
      'create dataset status 200/201 or 401': (r) => [200, 201, 401].includes(r.status),
      'create dataset response time < 1000ms': (r) => r.timings.duration < 1000,
      'create dataset returns id': (r) => {
        if ([200, 201].includes(r.status)) {
          const body = JSON.parse(r.body);
          return body.id || body.datasetId;
        }
        return true;
      },
    });
    
    errorRate.add(![200, 201, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
    
    if ([200, 201].includes(res.status)) {
      const body = JSON.parse(res.body);
      testDatasets.push(body.id || body.datasetId);
    }
  });

  sleep(1);

  // Test 4: List Policies
  group('List Policies', () => {
    const res = http.get(`${BASE_URL}/api/policies`, { headers });
    
    check(res, {
      'list policies status 200 or 401': (r) => [200, 401].includes(r.status),
      'list policies response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 5: List Leases
  group('List Leases', () => {
    const res = http.get(`${BASE_URL}/api/leases`, { headers });
    
    check(res, {
      'list leases status 200 or 401': (r) => [200, 401].includes(r.status),
      'list leases response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 6: Marketplace Offers
  group('Marketplace Offers', () => {
    const res = http.get(`${BASE_URL}/api/marketplace/offers`, { headers });
    
    check(res, {
      'marketplace status 200 or 401': (r) => [200, 401].includes(r.status),
      'marketplace response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 7: Audit Logs
  group('Audit Logs', () => {
    const res = http.get(`${BASE_URL}/api/audit`, { headers });
    
    check(res, {
      'audit logs status 200 or 401': (r) => [200, 401].includes(r.status),
      'audit logs response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(1);

  // Test 8: Webhooks List
  group('Webhooks', () => {
    const res = http.get(`${BASE_URL}/api/webhooks`, { headers });
    
    check(res, {
      'webhooks status 200 or 401': (r) => [200, 401].includes(r.status),
      'webhooks response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(0.5);

  // Test 9: Billing Invoices
  group('Billing Invoices', () => {
    const res = http.get(`${BASE_URL}/api/billing/invoices`, { headers });
    
    check(res, {
      'invoices status 200 or 401/403': (r) => [200, 401, 403].includes(r.status),
      'invoices response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401, 403].includes(res.status));
    apiDuration.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(1);
}

export function teardown(data) {
  console.log('Tearing down load test...');
  console.log(`Test completed at: ${new Date().toISOString()}`);
}
