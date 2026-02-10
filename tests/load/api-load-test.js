/**
 * K6 LOAD TESTING SUITE
 * 
 * Tests API performance under various load conditions
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 500 },   // Ramp up to 500 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '2m', target: 1000 },  // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'],                  // Error rate < 1%
    errors: ['rate<0.05'],                           // Custom error rate < 5%
  },
};

const BASE_URL = __ENV.API_URL || 'https://api.xase.ai';
const API_KEY = __ENV.API_KEY;

// Test scenarios
export default function () {
  const scenarios = [
    testHealthCheck,
    testDatasetList,
    testLeaseCreation,
    testPolicyValidation,
    testPrivacyAnalysis,
    testFederatedQuery,
  ];

  // Randomly select a scenario
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  sleep(1);
}

function testHealthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  
  check(res, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });

  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);
}

function testDatasetList() {
  const res = http.get(`${BASE_URL}/api/v1/datasets`, {
    headers: { 'X-API-Key': API_KEY },
  });

  check(res, {
    'dataset list status is 200': (r) => r.status === 200,
    'dataset list has data': (r) => JSON.parse(r.body).datasets !== undefined,
    'dataset list response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);
}

function testLeaseCreation() {
  const payload = JSON.stringify({
    datasetId: 'ds_test',
    purpose: 'TRAINING',
    duration: 3600,
  });

  const res = http.post(`${BASE_URL}/api/v1/leases`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'lease creation status is 200 or 201': (r) => [200, 201].includes(r.status),
    'lease has ID': (r) => JSON.parse(r.body).leaseId !== undefined,
    'lease creation response time < 1s': (r) => r.timings.duration < 1000,
  });

  errorRate.add(![200, 201].includes(res.status));
  apiLatency.add(res.timings.duration);
}

function testPolicyValidation() {
  const policy = `
apiVersion: xase.ai/v1
kind: DataAccessPolicy
metadata:
  name: test-policy
spec:
  dataset: test-dataset
  purpose: TRAINING
  columns:
    allow: ["id", "features"]
    deny: ["email", "ssn"]
`;

  const res = http.post(`${BASE_URL}/api/v1/policies/validate`, policy, {
    headers: {
      'Content-Type': 'text/plain',
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'policy validation status is 200': (r) => r.status === 200,
    'policy validation has result': (r) => JSON.parse(r.body).valid !== undefined,
    'policy validation response time < 300ms': (r) => r.timings.duration < 300,
  });

  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);
}

function testPrivacyAnalysis() {
  const payload = JSON.stringify({
    datasetId: 'ds_test',
    quasiIdentifiers: ['age', 'zipcode'],
    k: 5,
  });

  const res = http.post(`${BASE_URL}/api/v1/privacy/analyze`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'privacy analysis status is 200': (r) => r.status === 200,
    'privacy analysis has score': (r) => JSON.parse(r.body).privacyScore !== undefined,
    'privacy analysis response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);
}

function testFederatedQuery() {
  const payload = JSON.stringify({
    dataSource: 'postgres.xase.internal',
    query: 'SELECT COUNT(*) FROM users',
  });

  const res = http.post(`${BASE_URL}/api/v1/federated/query`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });

  check(res, {
    'federated query status is 200': (r) => r.status === 200,
    'federated query has results': (r) => JSON.parse(r.body).results !== undefined,
    'federated query response time < 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(res.status !== 200);
  apiLatency.add(res.timings.duration);
}

// Stress test scenario
export function stressTest() {
  const res = http.get(`${BASE_URL}/api/v1/datasets`, {
    headers: { 'X-API-Key': API_KEY },
  });

  check(res, {
    'stress test status is 200': (r) => r.status === 200,
  });

  errorRate.add(res.status !== 200);
}

// Spike test scenario
export function spikeTest() {
  const res = http.get(`${BASE_URL}/api/health`);

  check(res, {
    'spike test status is 200': (r) => r.status === 200,
    'spike test response time < 200ms': (r) => r.timings.duration < 200,
  });

  errorRate.add(res.status !== 200);
}

// Soak test configuration
export const soakOptions = {
  stages: [
    { duration: '5m', target: 200 },   // Ramp up
    { duration: '3h', target: 200 },   // Stay for 3 hours
    { duration: '5m', target: 0 },     // Ramp down
  ],
};
