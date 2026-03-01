/**
 * API Tests - Authentication Routes
 * Critical routes: POST /auth/login, POST /auth/register
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

describe('POST /api/auth/register', () => {
  const testEmail = `test-${Date.now()}@example.com`;

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  it('should register a new user successfully', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: testEmail,
        password: 'SecurePassword123!',
        region: 'US',
      }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toHaveProperty('user');
    expect(data.user.email).toBe(testEmail);
  });

  it('should reject registration with existing email', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: testEmail,
        password: 'SecurePassword123!',
        region: 'US',
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already exists');
  });

  it('should reject registration with weak password', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: `weak-${Date.now()}@example.com`,
        password: '123',
        region: 'US',
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should reject registration with invalid email', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'invalid-email',
        password: 'SecurePassword123!',
        region: 'US',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('should reject registration without required fields', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
      }),
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  const loginEmail = `login-${Date.now()}@example.com`;
  const loginPassword = 'SecurePassword123!';

  beforeAll(async () => {
    // Create test user
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Login Test User',
        email: loginEmail,
        password: loginPassword,
        region: 'US',
      }),
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: loginEmail },
    });
  });

  it('should login successfully with correct credentials', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail,
        password: loginPassword,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('token');
  });

  it('should reject login with incorrect password', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail,
        password: 'WrongPassword123!',
      }),
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should reject login with non-existent email', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: loginPassword,
      }),
    });

    expect(response.status).toBe(401);
  });

  it('should reject login without credentials', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('should rate limit excessive login attempts', async () => {
    const attempts = [];
    
    // Make 10 rapid login attempts
    for (let i = 0; i < 10; i++) {
      attempts.push(
        fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: loginEmail,
            password: 'WrongPassword',
          }),
        })
      );
    }

    const responses = await Promise.all(attempts);
    const statuses = responses.map(r => r.status);
    
    // At least one should be rate limited (429)
    expect(statuses.some(s => s === 429)).toBe(true);
  });
});
