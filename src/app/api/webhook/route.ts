import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma';
import { PRICE_IDS } from '@/lib/prices';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.created',
  'customer.updated',
]);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (!signature || !webhookSecret) {
      return new NextResponse('Missing signature or webhook secret', { status: 400 });
    }
    
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      console.log('Processing Stripe webhook event:', event.type);
      
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        
        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        
        case 'customer.created':
        case 'customer.updated':
          await handleCustomerUpdate(event.data.object as Stripe.Customer);
          break;
      }
      
      return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      return new NextResponse('Webhook handler failed', { status: 400 });
    }
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!customerId || !subscriptionId) {
    console.warn('Missing customer or subscription ID in checkout session');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionUpdate(subscription);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  const user = await prisma.$queryRaw<Array<{ id: string; tenant_id: string | null }>>`
    SELECT id, tenant_id FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1
  `;

  if (!user || user.length === 0) {
    console.error('User not found for Stripe customer:', customerId);
    return;
  }

  const userId = user[0].id;
  const tenantId = user[0].tenant_id;

  const planTier = getPlanTierFromPriceId(priceId);
  const status = subscription.status;

  await prisma.$executeRaw`
    INSERT INTO xase_subscriptions (
      id, user_id, tenant_id, stripe_subscription_id, stripe_customer_id,
      stripe_price_id, status, plan_tier, current_period_start, current_period_end,
      cancel_at_period_end, canceled_at, created_at, updated_at
    ) VALUES (
      ${subscription.id}, ${userId}, ${tenantId}, ${subscription.id}, ${customerId},
      ${priceId}, ${status}, ${planTier},
      ${new Date((subscription as any).current_period_start * 1000)},
      ${new Date((subscription as any).current_period_end * 1000)},
      ${subscription.cancel_at_period_end},
      ${subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null},
      NOW(), NOW()
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = EXCLUDED.status,
      plan_tier = EXCLUDED.plan_tier,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      canceled_at = EXCLUDED.canceled_at,
      updated_at = NOW()
  `;

  await prisma.$executeRaw`
    UPDATE users
    SET plan_tier = ${planTier}, subscription_status = ${status}, updated_at = NOW()
    WHERE id = ${userId}
  `;

  console.log('Subscription updated:', { userId, subscriptionId: subscription.id, status, planTier });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1
  `;

  if (!user || user.length === 0) {
    console.error('User not found for Stripe customer:', customerId);
    return;
  }

  const userId = user[0].id;

  await prisma.$executeRaw`
    UPDATE xase_subscriptions
    SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
    WHERE stripe_subscription_id = ${subscription.id}
  `;

  await prisma.$executeRaw`
    UPDATE users
    SET plan_tier = 'FREE', subscription_status = 'canceled', updated_at = NOW()
    WHERE id = ${userId}
  `;

  console.log('Subscription deleted:', { userId, subscriptionId: subscription.id });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const subscriptionId = (invoice as any).subscription as string | null;

  await prisma.$executeRaw`
    INSERT INTO xase_invoices (
      id, subscription_id, stripe_invoice_id, stripe_customer_id,
      amount_due, amount_paid, currency, status,
      invoice_pdf, hosted_invoice_url,
      period_start, period_end, created_at, updated_at
    ) VALUES (
      ${invoice.id}, ${subscriptionId}, ${invoice.id}, ${customerId},
      ${invoice.amount_due / 100}, ${invoice.amount_paid / 100}, ${invoice.currency}, ${invoice.status},
      ${invoice.invoice_pdf}, ${invoice.hosted_invoice_url},
      ${new Date(invoice.period_start * 1000)}, ${new Date(invoice.period_end * 1000)},
      NOW(), NOW()
    )
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      amount_paid = EXCLUDED.amount_paid,
      invoice_pdf = EXCLUDED.invoice_pdf,
      hosted_invoice_url = EXCLUDED.hosted_invoice_url,
      updated_at = NOW()
  `;

  console.log('Invoice payment succeeded:', { invoiceId: invoice.id, customerId });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const subscriptionId = (invoice as any).subscription as string | null;

  await prisma.$executeRaw`
    INSERT INTO xase_invoices (
      id, subscription_id, stripe_invoice_id, stripe_customer_id,
      amount_due, amount_paid, currency, status,
      invoice_pdf, hosted_invoice_url,
      period_start, period_end, created_at, updated_at
    ) VALUES (
      ${invoice.id}, ${subscriptionId}, ${invoice.id}, ${customerId},
      ${invoice.amount_due / 100}, ${invoice.amount_paid / 100}, ${invoice.currency}, ${invoice.status},
      ${invoice.invoice_pdf}, ${invoice.hosted_invoice_url},
      ${new Date(invoice.period_start * 1000)}, ${new Date(invoice.period_end * 1000)},
      NOW(), NOW()
    )
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()
  `;

  console.log('Invoice payment failed:', { invoiceId: invoice.id, customerId });
}

async function handleCustomerUpdate(customer: Stripe.Customer) {
  await prisma.$executeRaw`
    UPDATE users
    SET stripe_customer_id = ${customer.id}, updated_at = NOW()
    WHERE email = ${customer.email}
  `;

  console.log('Customer updated:', { customerId: customer.id, email: customer.email });
}

function getPlanTierFromPriceId(priceId: string | undefined): string {
  if (!priceId) return 'FREE';
  
  const inicianteId = String(PRICE_IDS.INICIANTE);
  const proId = String(PRICE_IDS.PRO);
  
  const priceMap: Record<string, string> = {};
  priceMap[inicianteId] = 'INICIANTE';
  priceMap[proId] = 'PRO';

  return priceMap[priceId] || 'FREE';
}
