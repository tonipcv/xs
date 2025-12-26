import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { PRICE_IDS } from '@/lib/prices';
import Stripe from 'stripe';

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);

export const config = {
  api: {
    bodyParser: false,
  },
};

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
      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || (session.metadata?.userId as string);
          const customerId = session.customer as string;

          if (!userId || !customerId) {
            console.error('Missing userId or customerId in checkout.session.completed');
            break;
          }

          // Salvar stripeCustomerId no usuário
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          const subscription = event.data.object as Stripe.Subscription;
          
          // Buscar o usuário pelo Stripe Customer ID
          const user = await prisma.user.findFirst({
            where: {
              stripeCustomerId: subscription.customer as string,
            },
          });

          if (!user) {
            throw new Error('User not found');
          }

          // Expandir price para ler metadata
          const priceId = subscription.items.data[0].price.id;
          const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
          const tier = (price.metadata?.tier || 'sandbox') as string;
          const useCases = parseInt(price.metadata?.use_cases_included || '1', 10);
          const retention = parseFloat(price.metadata?.retention_years || '0.08');

          // Mapear tier para entitlements
          let freeTokensLimit = 1000; // sandbox default

          switch (tier) {
            case 'team':
              freeTokensLimit = 200000;
              break;
            case 'business':
              freeTokensLimit = 500000;
              break;
            case 'enterprise':
            case 'enterprise_plus':
              freeTokensLimit = 999999999; // unlimited fair-use
              break;
          }

          // Atualizar entitlements do usuário
          await prisma.user.update({
            where: { id: user.id },
            data: {
              planTier: tier,
              useCasesIncluded: useCases,
              retentionYears: retention,
              freeTokensLimit,
            },
          });

          // Persistir/atualizar Subscription
          await prisma.subscription.upsert({
            where: { stripeId: subscription.id },
            create: {
              stripeId: subscription.id,
              userId: user.id,
              priceId: priceId,
              status: subscription.status,
              currentPeriodStart: new Date(((subscription as any).current_period_start ?? (subscription as any).currentPeriodStart) * 1000),
              currentPeriodEnd: new Date(((subscription as any).current_period_end ?? (subscription as any).currentPeriodEnd) * 1000),
              cancelAtPeriodEnd: ((subscription as any).cancel_at_period_end ?? (subscription as any).cancelAtPeriodEnd) as boolean,
            },
            update: {
              status: subscription.status,
              currentPeriodStart: new Date(((subscription as any).current_period_start ?? (subscription as any).currentPeriodStart) * 1000),
              currentPeriodEnd: new Date(((subscription as any).current_period_end ?? (subscription as any).currentPeriodEnd) * 1000),
              cancelAtPeriodEnd: ((subscription as any).cancel_at_period_end ?? (subscription as any).cancelAtPeriodEnd) as boolean,
            },
          });
          break;

        case 'customer.subscription.deleted':
          const deletedSubscription = event.data.object as Stripe.Subscription;
          
          // Buscar o usuário pelo Stripe Customer ID
          const userToUpdate = await prisma.user.findFirst({
            where: {
              stripeCustomerId: deletedSubscription.customer as string,
            },
          });

          if (!userToUpdate) {
            throw new Error('User not found');
          }

          // Voltar para sandbox tier
          await prisma.user.update({
            where: { id: userToUpdate.id },
            data: {
              planTier: 'sandbox',
              useCasesIncluded: 1,
              retentionYears: 0.08,
              freeTokensLimit: 1000,
            },
          });
          break;
      }

      return new NextResponse(JSON.stringify({ received: true }));
    } catch (error) {
      console.error('Webhook error:', error);
      return new NextResponse('Webhook handler failed', { status: 500 });
    }
  }

  return new NextResponse(JSON.stringify({ received: true }));
}
