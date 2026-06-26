import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req) {
  const body = await req.text();
  const signature = headers().get('stripe-signature');

  let event;

  try {
    if (!signature || !webhookSecret) return NextResponse.json({ message: 'Webhook secret missing' }, { status: 400 });
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ message: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId = session.customer;

        const type = session.metadata?.type;

        if (userId) {
          if (type === 'donation') {
            const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);
            await prisma.user.update({
              where: { id: userId },
              data: { proExpiresAt: expires },
            });
          } else {
            await prisma.user.update({
              where: { id: userId },
              data: {
                isPro: true,
                stripeCustomerId: customerId,
                subscriptionStatus: 'active',
              },
            });
          }
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status;
        
        await prisma.user.updateMany({
           where: { stripeCustomerId: subscription.customer },
           data: {
              isPro: status === 'active' || status === 'trialing',
              subscriptionStatus: status,
           }
        });
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json({ message: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
