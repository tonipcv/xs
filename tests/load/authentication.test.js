/**
 * k6 Load Test - Authentication Flow
 * Tests authentication endpoints under load
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('auth_errors');
const authDuration = new Trend('auth_duration');
const loginCount = new Counter('login_attempts');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
    auth_errors: ['rate<0.10'],
    checks: ['rate>0.90'],
  },
};

export default function () {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Test 1: Login Flow
  group('Login', () => {
    const payload = JSON.stringify({
      email: `loadtest${__VU}@example.com`,
      password: 'TestPassword123!',
    });

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, { headers });
    
    check(res, {
      'login status is 200 or 401': (r) => [200, 401].includes(r.status),
      'login response time < 1000ms': (r) => r.timings.duration < 1000,
      'login has response body': (r) => r.body.length > 0,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    authDuration.add(res.timings.duration);
    loginCount.add(1);
  });

  sleep(1);

  // Test 2: Registration Flow
  group('Registration', () => {
    const payload = JSON.stringify({
      name: `Load Test User ${__VU}-${__ITER}`,
      email: `loadtest${__VU}-${__ITER}-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      region: 'US',
    });

    const res = http.post(`${BASE_URL}/api/auth/register`, payload, { headers });
    
    check(res, {
      'register status is 200/201 or 400': (r) => [200, 201, 400].includes(r.status),
      'register response time < 2000ms': (r) => r.timings.duration < 2000,
    });
    
    errorRate.add(![200, 201, 400].includes(res.status));
    authDuration.add(res.timings.duration);
  });

  sleep(2);

  // Test 3: Password Reset Request
  group('Password Reset', () => {
    const payload = JSON.stringify({
      email: `loadtest${__VU}@example.com`,
    });

    const res = http.post(`${BASE_URL}/api/auth/forgot-password`, payload, { headers });
    
    check(res, {
      'forgot password status is 200': (r) => r.status === 200,
      'forgot password response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(res.status !== 200);
    authDuration.add(res.timings.duration);
  });

  sleep(1);

  // Test 4: Session Validation
  group('Session Check', () => {
    const res = http.get(`${BASE_URL}/api/auth/session`, { headers });
    
    check(res, {
      'session check status is 200 or 401': (r) => [200, 401].includes(r.status),
      'session check response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(![200, 401].includes(res.status));
    authDuration.add(res.timings.duration);
  });

  sleep(1);
}
