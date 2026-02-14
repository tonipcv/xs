import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const authLatency = new Trend('auth_latency');
const telemetryLatency = new Trend('telemetry_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp up to 50 users
    { duration: '5m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 500 },   // Ramp up to 500 users
    { duration: '5m', target: 1000 },  // Ramp up to 1000 users
    { duration: '10m', target: 1000 }, // Stay at 1000 users
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    'errors': ['rate<0.01'], // Error rate < 1%
    'http_req_failed': ['rate<0.01'], // Failed requests < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'xase_pk_load_test';
const BYPASS = (__ENV.SIDECAR_AUTH_BYPASS || '') === '1';

export default function () {
  const leaseId = `lease_load_${__VU}_${__ITER}`;

  // 1. Sidecar Auth
  const authStart = Date.now();
  const authRes = http.post(
    `${BASE_URL}/api/v1/sidecar/auth`,
    JSON.stringify({
      leaseId: leaseId,
      attestationReport: null,
      binaryHash: null,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    }
  );

  authLatency.add(Date.now() - authStart);

  let authBody;
  try {
    authBody = JSON.parse(authRes.body);
  } catch (_) {
    authBody = {};
  }

  const authOk = check(authRes, {
    'auth status is 200': (r) => r.status === 200,
    'auth has sessionId': () => authBody.sessionId !== undefined,
  });
  // Record SLA as a separate check that doesn't affect error metric
  check(authRes, { 'auth latency < 200ms': (r) => r.timings.duration < 200 });

  if (!authOk) {
    errorRate.add(1);
    return;
  }

  const { sessionId, stsToken } = authBody;

  // 2. Simulate telemetry reporting
  sleep(1); // Simulate 1 second of work

  const telemetryStart = Date.now();
  const telemetryRes = http.post(
    `${BASE_URL}/api/v1/sidecar/telemetry`,
    JSON.stringify({
      sessionId: sessionId,
      logs: [
        {
          segmentId: 'seg_00001',
          timestamp: new Date().toISOString(),
          eventType: 'download',
          bytesProcessed: 1000000,
          latencyMs: 50,
        },
        {
          segmentId: 'seg_00001',
          timestamp: new Date().toISOString(),
          eventType: 'watermark',
          latencyMs: 10,
        },
        {
          segmentId: 'seg_00001',
          timestamp: new Date().toISOString(),
          eventType: 'serve',
          bytesProcessed: 1000000,
          latencyMs: 1,
        },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    }
  );

  telemetryLatency.add(Date.now() - telemetryStart);

  const telemetryOk = check(telemetryRes, {
    'telemetry status is 200': (r) => r.status === 200,
  });
  // Record SLA separately
  check(telemetryRes, { 'telemetry latency < 100ms': (r) => r.timings.duration < 100 });

  if (!telemetryOk) {
    errorRate.add(1);
  }

  // 3. Check kill switch status (skip in dev bypass: session isn't persisted)
  if (!BYPASS) {
    const killSwitchRes = http.get(
      `${BASE_URL}/api/v1/sidecar/kill-switch?sessionId=${sessionId}`,
      {
        headers: {
          'X-API-Key': API_KEY,
        },
      }
    );

    const ksOk = check(killSwitchRes, {
      'kill-switch status is 200': (r) => r.status === 200,
    });
    check(killSwitchRes, { 'kill-switch latency < 50ms': (r) => r.timings.duration < 50 });
    if (!ksOk) {
      errorRate.add(1);
    }
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors;

  let summary = '\n';
  const checks = data.metrics.checks?.values;
  const req = data.metrics.http_req_duration?.values;
  const reqs = data.metrics.http_reqs?.values;
  const errs = data.metrics.errors?.values;
  const authLat = data.metrics.auth_latency?.values;
  const telLat = data.metrics.telemetry_latency?.values;

  summary += `${indent}✓ checks.........................: ${checks ? `${checks.passes}/${checks.passes + checks.fails}` : 'n/a'}\n`;
  summary += `${indent}✓ http_req_duration.............: ${req ? `avg=${req.avg.toFixed(2)}ms p(95)=${req['p(95)'].toFixed(2)}ms` : 'n/a'}\n`;
  summary += `${indent}✓ http_reqs.....................: ${reqs ? `${reqs.count} (${reqs.rate.toFixed(2)}/s)` : 'n/a'}\n`;
  summary += `${indent}✓ errors........................: ${errs ? `${(errs.rate * 100).toFixed(2)}%` : 'n/a'}\n`;
  summary += `${indent}✓ auth_latency..................: ${authLat ? `avg=${authLat.avg.toFixed(2)}ms` : 'n/a'}\n`;
  summary += `${indent}✓ telemetry_latency.............: ${telLat ? `avg=${telLat.avg.toFixed(2)}ms` : 'n/a'}\n`;

  return summary;
}
