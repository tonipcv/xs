/**
 * K6 Load Test - Streaming Scenario
 * Test 100 concurrent users streaming data
 * F2-003: Load Testing (k6 - 100 a 1000 concurrent users)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const streamingDuration = new Trend('streaming_duration');
const bytesReceived = new Counter('bytes_received');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 50 },   // Ramp up to 50 users
    { duration: '10m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    errors: ['rate<0.1'],              // Custom error rate below 10%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

/**
 * Setup function - runs once before test
 */
export function setup() {
  console.log('Starting streaming load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: 100 concurrent users`);
  
  return {
    startTime: Date.now(),
  };
}

/**
 * Main test function - runs for each VU
 */
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };

  // 1. Authenticate
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: `user${__VU}@loadtest.com`,
    password: 'LoadTest123!',
  }), { headers });

  const loginSuccess = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login has token': (r) => r.json('token') !== undefined,
  });

  if (!loginSuccess) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  const token = loginRes.json('token');
  const authHeaders = {
    ...headers,
    'Authorization': `Bearer ${token}`,
  };

  // 2. Get available datasets
  const datasetsRes = http.get(`${BASE_URL}/api/datasets`, { headers: authHeaders });
  
  check(datasetsRes, {
    'datasets fetched': (r) => r.status === 200,
    'has datasets': (r) => r.json().length > 0,
  });

  if (datasetsRes.status !== 200) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  const datasets = datasetsRes.json();
  const dataset = datasets[Math.floor(Math.random() * datasets.length)];

  // 3. Create lease
  const leaseRes = http.post(`${BASE_URL}/api/leases`, JSON.stringify({
    datasetId: dataset.datasetId,
    durationHours: 1,
  }), { headers: authHeaders });

  const leaseSuccess = check(leaseRes, {
    'lease created': (r) => r.status === 201,
    'lease has ID': (r) => r.json('leaseId') !== undefined,
  });

  if (!leaseSuccess) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  const lease = leaseRes.json();

  // 4. Stream data from sidecar
  const streamStart = Date.now();
  
  const streamRes = http.post(`${BASE_URL}/api/sidecar/stream`, JSON.stringify({
    leaseId: lease.leaseId,
    segmentIds: [`seg_${__VU}_${__ITER}`],
  }), { 
    headers: authHeaders,
    timeout: '30s',
  });

  const streamDuration = Date.now() - streamStart;
  streamingDuration.add(streamDuration);

  const streamSuccess = check(streamRes, {
    'stream successful': (r) => r.status === 200,
    'stream has data': (r) => r.body.length > 0,
    'stream duration acceptable': () => streamDuration < 5000,
  });

  if (streamSuccess && streamRes.body) {
    bytesReceived.add(streamRes.body.length);
  } else {
    errorRate.add(1);
  }

  // 5. Random think time between 1-3 seconds
  sleep(Math.random() * 2 + 1);

  // 6. Occasionally check billing usage
  if (__ITER % 10 === 0) {
    const billingRes = http.get(`${BASE_URL}/api/billing/usage`, { headers: authHeaders });
    
    check(billingRes, {
      'billing fetched': (r) => r.status === 200,
    });
  }
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nTest completed in ${duration.toFixed(2)} seconds`);
  console.log('Check metrics above for detailed results');
}
