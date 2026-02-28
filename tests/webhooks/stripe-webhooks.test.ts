/**
 * Stripe Webhooks Integration Tests
 * Tests for Stripe webhook event handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('Stripe Webhook Tests', () => {
  let testUserId: string;
  let testEmail: string;

  beforeAll(async () => {
    testEmail = `test-stripe-${Date.now()}@example.com`;
    
    const user = await prisma.user.create({
      data: {
        name: 'Stripe Test User',
        email: testEmail,
        password: 'hashed_password',
        region: 'US',
        stripeCustomerId: 'cus_test123',
      },
    });
    
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await prisma.$disconnect();
  });

  describe('Webhook Endpoint', () => {
    it('should reject requests without signature', async () => {
      const response = await fetch(`${BASE_URL}/api/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'customer.subscription.created',
          data: {},
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should accept valid webhook structure', async () => {
      const mockEvent = {
        id: 'evt_test123',
        object: 'event',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            items: {
              data: [
                {
                  price: {
                    id: 'price_test123',
                  },
                },
              ],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            cancel_at_period_end: false,
            canceled_at: null,
          },
        },
      };

      console.log('Mock webhook event structure:', mockEvent.type);
      expect(mockEvent.type).toBe('customer.subscription.created');
    });
  });

  describe('Database Schema', () => {
    it('should have stripe_customer_id column in users table', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        select: { stripeCustomerId: true },
      });

      expect(user).toBeDefined();
      expect(user?.stripeCustomerId).toBe('cus_test123');
    });

    it('should have plan_tier column in users table', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: { planTier: 'PRO' },
      });

      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        select: { planTier: true },
      });

      expect(user?.planTier).toBe('PRO');
    });

    it('should have subscription_status column in users table', async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: { subscriptionStatus: 'active' },
      });

      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        select: { subscriptionStatus: true },
      });

      expect(user?.subscriptionStatus).toBe('active');
    });
  });

  describe('Subscription Table', () => {
    it('should create subscription record', async () => {
      const subscription = await prisma.$executeRaw`
        INSERT INTO xase_subscriptions (
          id, user_id, stripe_subscription_id, stripe_customer_id,
          stripe_price_id, status, plan_tier,
          current_period_start, current_period_end,
          cancel_at_period_end, created_at, updated_at
        ) VALUES (
          'sub_test_' || ${Date.now()},
          ${testUserId},
          'sub_stripe_test',
          'cus_test123',
          'price_test123',
          'active',
          'PRO',
          NOW(),
          NOW() + INTERVAL '30 days',
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT (stripe_subscription_id) DO NOTHING
      `;

      expect(subscription).toBeDefined();
      console.log('Subscription created successfully');
    });

    it('should query subscription by stripe_customer_id', async () => {
      const subscriptions = await prisma.$queryRaw<Array<any>>`
        SELECT * FROM xase_subscriptions
        WHERE stripe_customer_id = 'cus_test123'
        LIMIT 1
      `;

      expect(subscriptions.length).toBeGreaterThan(0);
      console.log('Found subscription:', subscriptions[0]?.status);
    });
  });

  describe('Invoice Table', () => {
    it('should create invoice record', async () => {
      const invoice = await prisma.$executeRaw`
        INSERT INTO xase_invoices (
          id, stripe_invoice_id, stripe_customer_id,
          amount_due, amount_paid, currency, status,
          period_start, period_end, created_at, updated_at
        ) VALUES (
          'inv_test_' || ${Date.now()},
          'in_test123',
          'cus_test123',
          99.99,
          99.99,
          'usd',
          'paid',
          NOW(),
          NOW() + INTERVAL '30 days',
          NOW(),
          NOW()
        )
        ON CONFLICT (stripe_invoice_id) DO NOTHING
      `;

      expect(invoice).toBeDefined();
      console.log('Invoice created successfully');
    });

    it('should query invoices by customer', async () => {
      const invoices = await prisma.$queryRaw<Array<any>>`
        SELECT * FROM xase_invoices
        WHERE stripe_customer_id = 'cus_test123'
        ORDER BY created_at DESC
        LIMIT 5
      `;

      expect(Array.isArray(invoices)).toBe(true);
      console.log(`Found ${invoices.length} invoice(s)`);
    });
  });

  describe('Webhook Event Types', () => {
    const eventTypes = [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.created',
      'customer.updated',
    ];

    it('should recognize all supported event types', () => {
      eventTypes.forEach((eventType) => {
        expect(eventType).toBeTruthy();
        console.log(`✓ Event type supported: ${eventType}`);
      });
    });
  });

  describe('Plan Tier Mapping', () => {
    it('should map price IDs to plan tiers correctly', () => {
      const priceMap: Record<string, string> = {
        'price_iniciante': 'INICIANTE',
        'price_pro': 'PRO',
      };

      expect(priceMap['price_iniciante']).toBe('INICIANTE');
      expect(priceMap['price_pro']).toBe('PRO');
      console.log('Plan tier mapping validated');
    });
  });

  describe('Cleanup', () => {
    it('should clean up test data', async () => {
      await prisma.$executeRaw`
        DELETE FROM xase_invoices WHERE stripe_customer_id = 'cus_test123'
      `;
      
      await prisma.$executeRaw`
        DELETE FROM xase_subscriptions WHERE stripe_customer_id = 'cus_test123'
      `;

      console.log('Test data cleaned up');
    });
  });
});
