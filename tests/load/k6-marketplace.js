/**
 * K6 Load Test - Marketplace Browsing Scenario
 * Test 1000 concurrent users browsing marketplace
 * F2-003: Load Testing (k6 - 100 a 1000 concurrent users)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const searchDuration = new Trend('search_duration');
const offerLoadDuration = new Trend('offer_load_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '3m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 300 },   // Ramp up to 300 users
    { duration: '10m', target: 500 },  // Ramp up to 500 users
    { duration: '10m', target: 1000 }, // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '3m', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests must complete below 1.5s
    http_req_failed: ['rate<0.02'],    // Error rate must be below 2%
    errors: ['rate<0.05'],             // Custom error rate below 5%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

/**
 * Setup function
 */
export function setup() {
  console.log('Starting marketplace load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: 1000 concurrent users`);
  
  return {
    startTime: Date.now(),
  };
}

/**
 * Main test function
 */
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // 1. Browse marketplace offers (public endpoint)
  const offersRes = http.get(`${BASE_URL}/api/marketplace/offers`, { headers });
  
  const offersSuccess = check(offersRes, {
    'offers loaded': (r) => r.status === 200,
    'has offers': (r) => r.json().length > 0,
    'response time OK': (r) => r.timings.duration < 1500,
  });

  if (!offersSuccess) {
    errorRate.add(1);
  }

  offerLoadDuration.add(offersRes.timings.duration);

  sleep(Math.random() * 2 + 1);

  // 2. Search by data type
  const dataTypes = ['AUDIO', 'DICOM', 'TEXT'];
  const randomType = dataTypes[Math.floor(Math.random() * dataTypes.length)];
  
  const searchStart = Date.now();
  const searchRes = http.get(
    `${BASE_URL}/api/marketplace/offers?dataType=${randomType}`,
    { headers }
  );

  searchDuration.add(Date.now() - searchStart);

  check(searchRes, {
    'search successful': (r) => r.status === 200,
    'search has results': (r) => r.json().length >= 0,
  });

  sleep(Math.random() * 3 + 1);

  // 3. View specific offer details
  if (offersRes.status === 200 && offersRes.json().length > 0) {
    const offers = offersRes.json();
    const randomOffer = offers[Math.floor(Math.random() * offers.length)];
    
    const offerRes = http.get(
      `${BASE_URL}/api/marketplace/offers/${randomOffer.id}`,
      { headers }
    );

    check(offerRes, {
      'offer details loaded': (r) => r.status === 200,
      'offer has pricing': (r) => r.json('pricing') !== undefined,
    });

    sleep(Math.random() * 2 + 1);
  }

  // 4. Browse datasets (public)
  const datasetsRes = http.get(`${BASE_URL}/api/datasets/public`, { headers });
  
  check(datasetsRes, {
    'datasets loaded': (r) => r.status === 200,
  });

  sleep(Math.random() * 1 + 0.5);

  // 5. Check health endpoint
  if (__ITER % 20 === 0) {
    const healthRes = http.get(`${BASE_URL}/api/health`, { headers });
    
    check(healthRes, {
      'health check OK': (r) => r.status === 200,
      'system healthy': (r) => r.json('status') === 'healthy',
    });
  }
}

/**
 * Teardown function
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nMarketplace test completed in ${duration.toFixed(2)} seconds`);
}
