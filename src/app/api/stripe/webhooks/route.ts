/**
 * Stripe Webhooks Handler
 * Processes subscription and payment events from Stripe
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { sendEmail } from '@/lib/email/email-service';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/stripe/webhooks
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log('Received Stripe event:', event.type);

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
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
        await handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Log webhook event
    await prisma.auditLog.create({
      data: {
        action: 'STRIPE_WEBHOOK_RECEIVED',
        resourceType: 'stripe_event',
        resourceId: event.id,
        metadata: JSON.stringify({
          type: event.type,
          eventId: event.id,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  // Find user by Stripe customer ID
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  console.log('Subscription created:', subscriptionId);

  // Send confirmation email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Subscription Activated - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Activated!</h2>
          
          <p>Your XASE Sheets subscription has been successfully activated.</p>
          
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Plan:</strong> ${getSubscriptionTier(subscription)}<br>
            <strong>Status:</strong> Active<br>
            <strong>Billing Period:</strong> Active
          </div>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXTAUTH_URL}/dashboard" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Dashboard
            </a>
          </div>
          
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }

  console.log('Subscription created:', subscriptionId);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update subscription status
  // Note: User model doesn't have subscription fields
  // Subscription data should be stored in a separate Subscription table
  console.log('Subscription updated:', subscriptionId);

  console.log('Subscription updated:', subscriptionId);
}

/**
 * Handle subscription deleted/canceled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update subscription status
  // Note: User model doesn't have subscription fields
  // Subscription data should be stored in a separate Subscription table
  console.log('Subscription deleted:', subscriptionId);

  // Send cancellation email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Subscription Canceled - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Canceled</h2>
          
          <p>Your XASE Sheets subscription has been canceled.</p>
          
          <p>You will continue to have access until the end of your current billing period.</p>
          
          <p>If you change your mind, you can reactivate your subscription at any time.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXTAUTH_URL}/billing" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Manage Subscription
            </a>
          </div>
          
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }

  console.log('Subscription deleted:', subscriptionId);
}

/**
 * Handle invoice payment succeeded
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const invoiceId = invoice.id;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Create invoice record
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'INVOICE_PAID',
      resourceType: 'invoice',
      resourceId: invoiceId,
      metadata: JSON.stringify({
        invoiceId,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        paidAt: new Date(invoice.status_transitions.paid_at! * 1000),
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Send payment confirmation email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Payment Received - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Received</h2>
          
          <p>Thank you! Your payment has been successfully processed.</p>
          
          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Amount:</strong> ${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}<br>
            <strong>Invoice:</strong> ${invoiceId}<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString()}
          </div>
          
          <div style="margin: 30px 0;">
            <a href="${invoice.hosted_invoice_url}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Invoice
            </a>
          </div>
          
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }

  console.log('Invoice payment succeeded:', invoiceId);
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const invoiceId = invoice.id;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Log failed payment
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'INVOICE_PAYMENT_FAILED',
      resourceType: 'invoice',
      resourceId: invoiceId,
      metadata: JSON.stringify({
        invoiceId,
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
      }),
      status: 'FAILED',
      timestamp: new Date(),
    },
  });

  // Send payment failed email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: '⚠️ Payment Failed - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f44336;">Payment Failed</h2>
          
          <p>We were unable to process your payment.</p>
          
          <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
            <strong>Amount:</strong> ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency.toUpperCase()}<br>
            <strong>Invoice:</strong> ${invoiceId}<br>
            <strong>Attempt:</strong> ${invoice.attempt_count}
          </div>
          
          <p>Please update your payment method to avoid service interruption.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXTAUTH_URL}/billing" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Update Payment Method
            </a>
          </div>
          
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }

  console.log('Invoice payment failed:', invoiceId);
}

/**
 * Handle customer created
 */
async function handleCustomerCreated(customer: Stripe.Customer) {
  const customerId = customer.id;
  const email = customer.email;

  if (!email) {
    console.error('Customer has no email:', customerId);
    return;
  }

  // Update user with Stripe customer ID
  await prisma.user.updateMany({
    where: { email },
    data: { stripeCustomerId: customerId },
  });

  console.log('Customer created:', customerId);
}

/**
 * Handle payment intent succeeded
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent succeeded:', paymentIntent.id);
}

/**
 * Handle payment intent failed
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent failed:', paymentIntent.id);
}

/**
 * Get subscription tier from Stripe subscription
 */
function getSubscriptionTier(subscription: Stripe.Subscription): string {
  const priceId = subscription.items.data[0]?.price.id;
  
  // Map price IDs to tiers
  const tierMap: Record<string, string> = {
    [process.env.STRIPE_PRICE_INICIANTE || '']: 'INICIANTE',
    [process.env.STRIPE_PRICE_PRO || '']: 'PRO',
    [process.env.STRIPE_PRICE_ENTERPRISE || '']: 'ENTERPRISE',
  };

  return tierMap[priceId] || 'FREE';
}
