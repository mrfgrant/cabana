import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SLOT_MESSAGES, toSlotError } from '@/lib/availability';
import { attachStripeSession, createPendingBooking } from '@/lib/bookings';
import { getSettings } from '@/lib/settings';
import { blockRange, longDate } from '@/lib/format';
import { sql } from '@/lib/db';
import { allow, clientIp, liveHoldsFor } from '@/lib/limits';

export const dynamic = 'force-dynamic';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Cheap abuse guard: a visitor gets 8 checkout attempts in 10 minutes.
  if (!(await allow(`checkout:${ip}`, 8, 600))) {
    return bad('Too many attempts. Wait a few minutes and try again.', 429);
  }

  const body = await req.json().catch(() => null);
  if (!body) return bad('Malformed request.');

  const {
    cabana_id, booking_date, block_id,
    first_name, last_name, email, phone, guests,
    special_requests, notes, policy_accepted, sms_consent,
  } = body;

  // Server-side validation. The browser is not trusted.
  if (!cabana_id || !block_id || !/^\d{4}-\d{2}-\d{2}$/.test(booking_date ?? '')) {
    return bad('Choose a cabana, a date, and a time.');
  }
  if (!first_name?.trim() || !last_name?.trim()) return bad('Enter your first and last name.');
  if (!/^\S+@\S+\.\S+$/.test(email ?? '')) return bad('Enter a valid email address.');
  if ((phone ?? '').replace(/\D/g, '').length < 10) return bad('Enter a valid mobile number.');
  if (!policy_accepted) return bad('You must accept the reservation policy to continue.');

  const settings = await getSettings();
  const guestCount = Number(guests);

  const [cab] = await sql<{ name: string; max_guests: number }[]>`
    select name, max_guests from cabana.cabanas where id = ${cabana_id} and active
  `;
  if (!cab) return bad('That cabana is not available.');
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > cab.max_guests) {
    return bad(`${cab.name} seats up to ${cab.max_guests} guests.`);
  }

  // One visitor should not be able to sit on the whole patio.
  if ((await liveHoldsFor(ip)) >= 2) {
    return bad('You already have a reservation in checkout. Finish or cancel it first.', 429);
  }

  // Verify payments are configured BEFORE taking inventory. Otherwise a
  // misconfigured deploy strands a cabana on every attempt.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('checkout attempted with no STRIPE_SECRET_KEY set');
    return bad('Online booking is temporarily unavailable. Please call the venue to reserve.', 503);
  }

  let created;
  try {
    created = await createPendingBooking(
      { cabana_id, booking_date, block_id },
      {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        guests: guestCount,
        special_requests: special_requests?.trim() || null,
        notes: notes?.trim() || null,
        sms_consent: Boolean(sms_consent),
      },
      ip,
    );
  } catch (err) {
    const slotErr = toSlotError(err);
    if (slotErr) return NextResponse.json({ error: SLOT_MESSAGES[slotErr.reason] }, { status: 409 });
    console.error('checkout failed', err);
    return bad('Could not start checkout. Try again.', 500);
  }

  const [slot] = await sql<{ cabana_name: string; start_time: string; end_time: string }[]>`
    select c.name as cabana_name, b.start_time::text, b.end_time::text
    from cabana.cabanas c, cabana.booking_blocks b
    where c.id = ${cabana_id} and b.id = ${block_id}
  `;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email.trim().toLowerCase(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: settings.pricing.currency ?? 'usd',
            unit_amount: created.totalCents,
            product_data: {
              name: `${slot.cabana_name} - ${settings.business.name}`,
              description: `${longDate(booking_date)}, ${blockRange(slot.start_time, slot.end_time)}`,
            },
          },
        },
      ],
      metadata: { booking_id: created.bookingId, booking_number: created.bookingNumber },
      payment_intent_data: {
        metadata: { booking_id: created.bookingId, booking_number: created.bookingNumber },
      },
      success_url: `${site}/booking/${created.bookingNumber}?paid=1`,
      cancel_url: `${site}/?cancelled=${created.bookingNumber}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await attachStripeSession(created.bookingId, session.id);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('stripe session failed', err);
    // Release the hold rather than stranding the slot for ten minutes.
    await sql`
      update cabana.bookings set booking_status = 'EXPIRED' where id = ${created.bookingId}
    `;
    await sql`delete from cabana.booking_holds where session_id = ${created.bookingId}`;
    return bad('Payment could not be started. No charge was made. Try again.', 502);
  }
}
