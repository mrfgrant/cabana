import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db';
import { sendBookingNotifications } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Unsigned' }, { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error('webhook signature rejected', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true, ignored: 'unpaid session' });
    }

    const paymentIntent =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

    try {
      // Returns the existing row untouched if this event is a replay.
      const [booking] = await sql<{ id: string; booking_status: string; already: boolean }[]>`
        with before as (
          select booking_status = 'CONFIRMED' as already
          from cabana.bookings where stripe_session_id = ${session.id}
        ),
        result as (
          select * from cabana.confirm_stripe_booking(${session.id}, ${paymentIntent})
        )
        select result.id, result.booking_status::text, coalesce(before.already, false) as already
        from result, before
      `;

      if (!booking) {
        console.error('webhook: no booking for session', session.id);
        return NextResponse.json({ received: true, warning: 'no matching booking' });
      }

      // Confirmations go out once, on first confirmation only.
      if (!booking.already) {
        await sendBookingNotifications(booking.id, 'BOOKING_CONFIRMED');
      }
    } catch (err) {
      console.error('webhook processing failed', err);
      // 500 tells Stripe to retry. Safe, because confirmation is idempotent.
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    await sql`
      update cabana.bookings set booking_status = 'EXPIRED', updated_at = now()
      where stripe_session_id = ${session.id} and booking_status = 'HELD'
    `;
    await sql`
      delete from cabana.booking_holds
      where session_id in (
        select id::text from cabana.bookings where stripe_session_id = ${session.id}
      )
    `;
  }

  return NextResponse.json({ received: true });
}
