/**
 * Stripe Webhooks Handler
 * Processes subscription and payment events from Stripe
 * F1-003: Reativar Stripe Webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '@/lib/email/email-service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

const prisma = new PrismaClient();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = headers();
    const signature = headersList.get('stripe-signature');

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
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Log webhook received
    await prisma.auditLog.create({
      data: {
        action: 'STRIPE_WEBHOOK_RECEIVED',
        resourceType: 'webhook',
        resourceId: event.id,
        metadata: JSON.stringify({
          type: event.type,
          created: event.created,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

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
  console.log('Subscription created:', subscription.id);

  const customerId = subscription.customer as string;
  const customer = await stripe.customers.retrieve(customerId);

  // Find user by Stripe customer ID
  const user = await prisma.user.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update user subscription status
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionPlan: subscription.items.data[0]?.price.id,
    },
  });

  // Log subscription created
  await prisma.auditLog.create({
    data: {
      action: 'SUBSCRIPTION_CREATED',
      resourceType: 'subscription',
      resourceId: subscription.id,
      userId: user.id,
      metadata: JSON.stringify({
        customerId,
        status: subscription.status,
        plan: subscription.items.data[0]?.price.id,
        currentPeriodEnd: subscription.current_period_end,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Send confirmation email
  if ('email' in customer && customer.email) {
    await sendEmail({
      to: customer.email,
      subject: '✅ Subscription Activated - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Activated</h2>
          <p>Your XASE Sheets subscription has been successfully activated!</p>
          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Subscription ID:</strong> ${subscription.id}<br>
            <strong>Status:</strong> ${subscription.status}<br>
            <strong>Billing Period:</strong> ${new Date(subscription.current_period_start * 1000).toLocaleDateString()} - ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}
          </div>
          <p>You now have access to all premium features.</p>
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
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Subscription updated:', subscription.id);

  // Find user by subscription ID
  const user = await prisma.user.findFirst({
    where: {
      stripeSubscriptionId: subscription.id,
    },
  });

  if (!user) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  // Update user subscription status
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: subscription.status,
      subscriptionPlan: subscription.items.data[0]?.price.id,
    },
  });

  // Log subscription updated
  await prisma.auditLog.create({
    data: {
      action: 'SUBSCRIPTION_UPDATED',
      resourceType: 'subscription',
      resourceId: subscription.id,
      userId: user.id,
      metadata: JSON.stringify({
        status: subscription.status,
        plan: subscription.items.data[0]?.price.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Send notification if subscription is being canceled
  if (subscription.cancel_at_period_end && user.email) {
    await sendEmail({
      to: user.email,
      subject: '⚠️ Subscription Cancellation Scheduled',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff9800;">Subscription Cancellation Scheduled</h2>
          <p>Your XASE Sheets subscription will be canceled at the end of the current billing period.</p>
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Cancellation Date:</strong> ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}<br>
            <strong>Access Until:</strong> ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}
          </div>
          <p>You will continue to have access to premium features until the end of your billing period.</p>
          <p>Changed your mind? You can reactivate your subscription anytime.</p>
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
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Subscription deleted:', subscription.id);

  // Find user by subscription ID
  const user = await prisma.user.findFirst({
    where: {
      stripeSubscriptionId: subscription.id,
    },
  });

  if (!user) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  // Update user subscription status
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      subscriptionPlan: null,
    },
  });

  // Log subscription deleted
  await prisma.auditLog.create({
    data: {
      action: 'SUBSCRIPTION_DELETED',
      resourceType: 'subscription',
      resourceId: subscription.id,
      userId: user.id,
      metadata: JSON.stringify({
        canceledAt: subscription.canceled_at,
        endedAt: subscription.ended_at,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Send confirmation email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Subscription Canceled - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Canceled</h2>
          <p>Your XASE Sheets subscription has been canceled.</p>
          <p>You can still access your data and reactivate your subscription anytime.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXTAUTH_URL}/billing" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reactivate Subscription
            </a>
          </div>
          <p>We're sorry to see you go. If you have any feedback, please let us know.</p>
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }
}

/**
 * Handle invoice payment succeeded
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Invoice payment succeeded:', invoice.id);

  const customerId = invoice.customer as string;
  const customer = await stripe.customers.retrieve(customerId);

  // Find user by Stripe customer ID
  const user = await prisma.user.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Log payment succeeded
  await prisma.auditLog.create({
    data: {
      action: 'INVOICE_PAID',
      resourceType: 'invoice',
      resourceId: invoice.id,
      userId: user.id,
      metadata: JSON.stringify({
        amount: invoice.amount_paid,
        currency: invoice.currency,
        subscriptionId: invoice.subscription,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  // Send receipt email
  if ('email' in customer && customer.email) {
    await sendEmail({
      to: customer.email,
      subject: '✅ Payment Received - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Received</h2>
          <p>Thank you for your payment!</p>
          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Invoice ID:</strong> ${invoice.id}<br>
            <strong>Amount:</strong> ${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}<br>
            <strong>Billing Period:</strong> ${new Date(invoice.period_start * 1000).toLocaleDateString()} - ${new Date(invoice.period_end * 1000).toLocaleDateString()}<br>
            <strong>Status:</strong> Paid
          </div>
          ${invoice.hosted_invoice_url ? `
            <div style="margin: 30px 0;">
              <a href="${invoice.hosted_invoice_url}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                View Invoice
              </a>
            </div>
          ` : ''}
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Invoice payment failed:', invoice.id);

  const customerId = invoice.customer as string;
  const customer = await stripe.customers.retrieve(customerId);

  // Find user by Stripe customer ID
  const user = await prisma.user.findFirst({
    where: {
      stripeCustomerId: customerId,
    },
  });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Log payment failed
  await prisma.auditLog.create({
    data: {
      action: 'INVOICE_PAYMENT_FAILED',
      resourceType: 'invoice',
      resourceId: invoice.id,
      userId: user.id,
      metadata: JSON.stringify({
        amount: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: invoice.next_payment_attempt,
      }),
      status: 'FAILED',
      timestamp: new Date(),
    },
  });

  // Send payment failed email
  if ('email' in customer && customer.email) {
    await sendEmail({
      to: customer.email,
      subject: '❌ Payment Failed - XASE Sheets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f44336;">Payment Failed</h2>
          <p>We were unable to process your payment for XASE Sheets.</p>
          <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
            <strong>Invoice ID:</strong> ${invoice.id}<br>
            <strong>Amount:</strong> ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency.toUpperCase()}<br>
            <strong>Attempt:</strong> ${invoice.attempt_count}<br>
            ${invoice.next_payment_attempt ? `<strong>Next Attempt:</strong> ${new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()}` : ''}
          </div>
          <p>Please update your payment method to avoid service interruption.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.NEXTAUTH_URL}/billing" style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Update Payment Method
            </a>
          </div>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The XASE Team</p>
        </div>
      `,
    });
  }
}

/**
 * Handle customer created
 */
async function handleCustomerCreated(customer: Stripe.Customer) {
  console.log('Customer created:', customer.id);

  // Log customer created
  await prisma.auditLog.create({
    data: {
      action: 'STRIPE_CUSTOMER_CREATED',
      resourceType: 'customer',
      resourceId: customer.id,
      metadata: JSON.stringify({
        email: customer.email,
        created: customer.created,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  }).catch(() => {});
}

/**
 * Handle payment intent succeeded
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent succeeded:', paymentIntent.id);

  // Log payment intent
  await prisma.auditLog.create({
    data: {
      action: 'PAYMENT_SUCCEEDED',
      resourceType: 'payment',
      resourceId: paymentIntent.id,
      metadata: JSON.stringify({
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        customerId: paymentIntent.customer,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  }).catch(() => {});
}

/**
 * Handle payment intent failed
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment intent failed:', paymentIntent.id);

  // Log payment intent failed
  await prisma.auditLog.create({
    data: {
      action: 'PAYMENT_FAILED',
      resourceType: 'payment',
      resourceId: paymentIntent.id,
      metadata: JSON.stringify({
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        customerId: paymentIntent.customer,
        lastPaymentError: paymentIntent.last_payment_error?.message,
      }),
      status: 'FAILED',
      timestamp: new Date(),
    },
  }).catch(() => {});
}
