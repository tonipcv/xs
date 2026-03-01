/**
 * K6 Load Test - Sidecar Performance
 * Test Sidecar: 350+ arquivos/segundo sustentado
 * F2-003: Load Testing - Sidecar throughput
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const throughput = new Counter('files_processed');
const processingTime = new Trend('processing_time');
const filesPerSecond = new Trend('files_per_second');

// Test configuration - targeting 350+ files/second
export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 350, // 350 iterations per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    'files_per_second': ['avg>=350'], // Must sustain 350+ files/second
    'processing_time': ['p(95)<500'],  // 95% processed in <500ms
    'http_req_failed': ['rate<0.01'],  // Error rate <1%
  },
};

const BASE_URL = __ENV.SIDECAR_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY || 'test-api-key';

let fileCounter = 0;
let lastSecond = 0;
let filesThisSecond = 0;

/**
 * Setup function
 */
export function setup() {
  console.log('Starting Sidecar performance test...');
  console.log(`Sidecar URL: ${BASE_URL}`);
  console.log(`Target: 350+ files/second sustained`);
  
  return {
    startTime: Date.now(),
  };
}

/**
 * Main test function - process one file per iteration
 */
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  const currentSecond = Math.floor(Date.now() / 1000);
  
  if (currentSecond !== lastSecond) {
    if (filesThisSecond > 0) {
      filesPerSecond.add(filesThisSecond);
    }
    filesThisSecond = 0;
    lastSecond = currentSecond;
  }

  const fileId = `file_${__VU}_${__ITER}_${fileCounter++}`;
  const startTime = Date.now();

  // Process file through sidecar
  const processRes = http.post(`${BASE_URL}/api/process`, JSON.stringify({
    fileId,
    dataType: 'AUDIO',
    operation: 'watermark',
    leaseId: `lease_${__VU}`,
  }), { 
    headers,
    timeout: '5s',
  });

  const duration = Date.now() - startTime;
  processingTime.add(duration);

  const success = check(processRes, {
    'processing successful': (r) => r.status === 200,
    'has watermark': (r) => r.json('watermarked') === true,
    'processing fast': () => duration < 500,
  });

  if (success) {
    throughput.add(1);
    filesThisSecond++;
  } else {
    errorRate.add(1);
  }

  // No sleep - we want maximum throughput
}

/**
 * Teardown function
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nSidecar test completed in ${duration.toFixed(2)} seconds`);
  console.log('Check if sustained 350+ files/second');
}
