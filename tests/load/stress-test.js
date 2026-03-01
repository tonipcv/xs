/**
 * k6 Stress Test - Push System to Limits
 * Gradually increases load to find breaking point
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestRate = new Counter('request_rate');
const activeUsers = new Gauge('active_users');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp up to 50 users
    { duration: '5m', target: 50 },    // Stay at 50
    { duration: '2m', target: 100 },   // Ramp to 100
    { duration: '5m', target: 100 },   // Stay at 100
    { duration: '2m', target: 200 },   // Ramp to 200
    { duration: '5m', target: 200 },   // Stay at 200
    { duration: '2m', target: 300 },   // Ramp to 300
    { duration: '5m', target: 300 },   // Stay at 300
    { duration: '2m', target: 500 },   // Ramp to 500
    { duration: '5m', target: 500 },   // Stay at 500
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.15'],
  },
};

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  activeUsers.add(__VU);

  // Mix of different endpoints
  const endpoints = [
    { method: 'GET', url: '/api/health', weight: 20 },
    { method: 'GET', url: '/api/datasets', weight: 30 },
    { method: 'GET', url: '/api/policies', weight: 20 },
    { method: 'GET', url: '/api/leases', weight: 15 },
    { method: 'GET', url: '/api/marketplace/offers', weight: 10 },
    { method: 'GET', url: '/api/webhooks', weight: 5 },
  ];

  // Select random endpoint based on weight
  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;
  let selectedEndpoint = endpoints[0];

  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      selectedEndpoint = endpoint;
      break;
    }
  }

  // Make request
  const startTime = Date.now();
  const res = http.request(
    selectedEndpoint.method,
    `${BASE_URL}${selectedEndpoint.url}`,
    null,
    { headers }
  );
  const duration = Date.now() - startTime;

  // Record metrics
  check(res, {
    'status is 200 or 401': (r) => [200, 401].includes(r.status),
    'response time < 5000ms': (r) => r.timings.duration < 5000,
  });

  errorRate.add(![200, 401].includes(res.status));
  responseTime.add(duration);
  requestRate.add(1);

  // Variable sleep based on load
  const sleepTime = __VU < 100 ? 1 : __VU < 300 ? 0.5 : 0.3;
  sleep(sleepTime);
}

export function handleSummary(data) {
  return {
    'stress-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n';
  summary += `${indent}Stress Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;

  // Test duration
  summary += `${indent}Test Duration: ${data.state.testRunDurationMs / 1000}s\n\n`;

  // HTTP metrics
  if (data.metrics.http_reqs) {
    summary += `${indent}HTTP Requests:\n`;
    summary += `${indent}  Total: ${data.metrics.http_reqs.values.count}\n`;
    summary += `${indent}  Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s\n\n`;
  }

  // Response time
  if (data.metrics.http_req_duration) {
    summary += `${indent}Response Time:\n`;
    summary += `${indent}  Avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  Min: ${data.metrics.http_req_duration.values.min.toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
    summary += `${indent}  p(50): ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
    summary += `${indent}  p(95): ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  p(99): ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  }

  // Error rate
  if (data.metrics.http_req_failed) {
    const failRate = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);
    summary += `${indent}Error Rate: ${failRate}%\n\n`;
  }

  // VUs
  if (data.metrics.vus) {
    summary += `${indent}Virtual Users:\n`;
    summary += `${indent}  Max: ${data.metrics.vus.values.max}\n`;
    summary += `${indent}  Min: ${data.metrics.vus.values.min}\n\n`;
  }

  // Checks
  if (data.metrics.checks) {
    const passRate = (data.metrics.checks.values.rate * 100).toFixed(2);
    summary += `${indent}Checks Pass Rate: ${passRate}%\n\n`;
  }

  summary += `${indent}${'='.repeat(50)}\n`;

  return summary;
}
