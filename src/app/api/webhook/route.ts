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
  'customer.subscription.deleted'
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
      console.log('Stripe webhook event:', event.type);
      
      // Webhook processing disabled until User schema includes stripeCustomerId, planTier fields
      // and Subscription model is added to Prisma schema
      console.log('Webhook processing skipped - schema fields not yet implemented');
      
      return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      return new NextResponse('Webhook handler failed', { status: 400 });
    }
  }

  return new NextResponse(JSON.stringify({ received: true }), { status: 200 });
}
