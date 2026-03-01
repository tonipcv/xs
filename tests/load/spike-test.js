/**
 * k6 Spike Test - Sudden Traffic Surge
 * Tests system behavior under sudden load spikes
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('spike_errors');
const spikeDuration = new Trend('spike_response_time');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';

export const options = {
  stages: [
    { duration: '30s', target: 10 },    // Normal load
    { duration: '2m', target: 10 },     // Stay normal
    { duration: '10s', target: 1000 },  // SPIKE!
    { duration: '3m', target: 1000 },   // Sustain spike
    { duration: '10s', target: 10 },    // Back to normal
    { duration: '2m', target: 10 },     // Recovery period
    { duration: '10s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.20'],
    spike_errors: ['rate<0.25'],
  },
};

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  // Health check endpoint (lightweight)
  const res = http.get(`${BASE_URL}/api/health`, { headers });
  
  check(res, {
    'spike test status ok': (r) => [200, 503].includes(r.status),
    'spike test response < 5000ms': (r) => r.timings.duration < 5000,
  });

  errorRate.add(![200, 503].includes(res.status));
  spikeDuration.add(res.timings.duration);

  // Minimal sleep during spike
  sleep(0.1);
}
