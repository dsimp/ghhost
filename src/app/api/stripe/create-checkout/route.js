import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '../../../../auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const sessionAuth = await auth();
    const userEmail = sessionAuth?.user?.email;
    const userId = sessionAuth?.user?.id;

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, amount, priceId } = await request.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (type === 'donation') {
      // Create a dynamic one-time payment checkout session
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: '72-Hour Ghhost Pro Pass',
                description: 'Support Ghhost & Unlock 72 hours of Pro access.',
              },
              unit_amount: Math.round(amount * 100), // convert dollars to cents
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: userId,
          type: 'donation'
        },
        success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/donate`,
      });

      return NextResponse.json({ url: checkoutSession.url });

    } else if (type === 'subscription') {
      
      if (!priceId) {
        return NextResponse.json({ error: 'Price ID is required for subscriptions.' }, { status: 400 });
      }

      // Create a recurring subscription checkout session
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: userEmail,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          userId: userId,
          type: 'subscription'
        },
        success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/donate`,
      });

      return NextResponse.json({ url: checkoutSession.url });

    } else {
       return NextResponse.json({ error: 'Invalid checkout type.' }, { status: 400 });
    }

  } catch (err) {
    console.error('Stripe Checkout Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
