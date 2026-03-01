/**
 * k6 Load Testing Configuration
 * Tests system performance under various load conditions
 */

export const scenarios = {
  // Smoke test - minimal load to verify system works
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '1m',
  },

  // Load test - normal expected load
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 10 },  // Ramp up to 10 users
      { duration: '5m', target: 10 },  // Stay at 10 users
      { duration: '2m', target: 50 },  // Ramp up to 50 users
      { duration: '5m', target: 50 },  // Stay at 50 users
      { duration: '2m', target: 0 },   // Ramp down
    ],
    gracefulRampDown: '30s',
  },

  // Stress test - push system to limits
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },   // Ramp up to 50
      { duration: '5m', target: 50 },   // Stay at 50
      { duration: '2m', target: 100 },  // Ramp up to 100
      { duration: '5m', target: 100 },  // Stay at 100
      { duration: '2m', target: 200 },  // Ramp up to 200
      { duration: '5m', target: 200 },  // Stay at 200
      { duration: '2m', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '30s',
  },

  // Spike test - sudden traffic spike
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 10 },   // Normal load
      { duration: '1m', target: 10 },    // Stay normal
      { duration: '10s', target: 500 },  // Sudden spike
      { duration: '3m', target: 500 },   // Stay at spike
      { duration: '10s', target: 10 },   // Back to normal
      { duration: '3m', target: 10 },    // Stay normal
      { duration: '10s', target: 0 },    // Ramp down
    ],
  },

  // Soak test - sustained load over time
  soak: {
    executor: 'constant-vus',
    vus: 50,
    duration: '30m',
  },

  // Breakpoint test - find system limits
  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 10,
    timeUnit: '1s',
    preAllocatedVUs: 500,
    maxVUs: 1000,
    stages: [
      { duration: '2m', target: 10 },    // 10 req/s
      { duration: '5m', target: 50 },    // 50 req/s
      { duration: '5m', target: 100 },   // 100 req/s
      { duration: '5m', target: 200 },   // 200 req/s
      { duration: '5m', target: 500 },   // 500 req/s
      { duration: '5m', target: 1000 },  // 1000 req/s
    ],
  },
};

export const thresholds = {
  // HTTP errors should be less than 1%
  http_req_failed: ['rate<0.01'],
  
  // 95% of requests should be below 500ms
  http_req_duration: ['p(95)<500'],
  
  // 99% of requests should be below 1000ms
  'http_req_duration{expected_response:true}': ['p(99)<1000'],
  
  // Average response time should be below 200ms
  http_req_duration: ['avg<200'],
  
  // Request rate should be above 100 req/s under load
  http_reqs: ['rate>100'],
  
  // Checks should pass 99% of the time
  checks: ['rate>0.99'],
};

export const options = {
  // Disable certificate validation for local testing
  insecureSkipTLSVerify: true,
  
  // Batch requests for better performance
  batch: 10,
  batchPerHost: 5,
  
  // Connection settings
  noConnectionReuse: false,
  noVUConnectionReuse: false,
  
  // Timeout settings
  httpDebug: 'full',
  maxRedirects: 4,
  
  // Tags for filtering results
  tags: {
    testType: 'load',
    environment: 'staging',
  },
};

export default {
  scenarios,
  thresholds,
  options,
};
