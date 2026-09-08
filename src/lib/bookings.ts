import { sql } from './db';
import { getSettings } from './settings';
import type { PaymentMethod } from './types';

export interface CustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  guests: number;
  special_requests?: string | null;
  notes?: string | null;
  sms_consent?: boolean;
}

export interface SlotInput {
  cabana_id: string;
  booking_date: string;
  block_id: string;
}

/**
 * Reserves the slot and writes a provisional booking in one transaction.
 * If the slot is gone, the whole thing rolls back and nothing is written.
 */
export async function createPendingBooking(
  slot: SlotInput,
  customer: CustomerInput,
  clientIp: string | null = null,
) {
  const settings = await getSettings();
  const { base_price_cents, tax_cents, total_cents } = settings.pricing;
  const holdMinutes = settings.booking.hold_minutes ?? 10;
  const holdKey = crypto.randomUUID();

  return sql.begin(async (tx) => {
    await tx`
      select cabana.acquire_hold(
        ${slot.cabana_id}::uuid, ${slot.booking_date}::date, ${slot.block_id}::uuid,
        ${holdKey}, ${holdMinutes}::int, ${clientIp}
      )
    `;

    const [c] = await tx<{ id: string }[]>`
      insert into cabana.customers (first_name, last_name, email, phone)
      values (${customer.first_name}, ${customer.last_name}, ${customer.email}, ${customer.phone})
      on conflict (email, phone) do update
        set first_name = excluded.first_name,
            last_name  = excluded.last_name,
            updated_at = now()
      returning id
    `;

    const [b] = await tx<{ id: string; booking_number: string }[]>`
      insert into cabana.bookings (
        customer_id, cabana_id, booking_date, block_id, guests,
        base_price_cents, tax_cents, total_cents,
        payment_method, payment_status, booking_status,
        special_requests, notes, policy_accepted_at, sms_consent
      ) values (
        ${c.id}, ${slot.cabana_id}, ${slot.booking_date}, ${slot.block_id}, ${customer.guests},
        ${base_price_cents}, ${tax_cents}, ${total_cents},
        'STRIPE', 'PENDING', 'HELD',
        ${customer.special_requests ?? null}, ${customer.notes ?? null},
        now(), ${customer.sms_consent ?? false}
      )
      returning id, booking_number
    `;

    await tx`
      update cabana.booking_holds set session_id = ${b.id}
      where cabana_id = ${slot.cabana_id}::uuid
        and booking_date = ${slot.booking_date}::date
        and block_id = ${slot.block_id}::uuid
    `;

    return { bookingId: b.id, bookingNumber: b.booking_number, totalCents: total_cents };
  });
}

/** Manager-created booking. Confirmed on the spot, payment collected elsewhere. */
export async function createManualBooking(
  slot: SlotInput,
  customer: CustomerInput,
  payment: { method: PaymentMethod; status: 'PAID' | 'UNPAID'; totalCentsOverride?: number | null },
  managerId: string,
) {
  const settings = await getSettings();
  const std = settings.pricing;
  const complimentary = payment.method === 'COMPLIMENTARY';

  // Managers can charge whatever was agreed at the door. Tax is backed out of
  // the total using the configured ratio so the books still split correctly.
  const total_cents = complimentary
    ? 0
    : payment.totalCentsOverride ?? std.total_cents;
  const ratio =
    std.base_price_cents + std.tax_cents > 0
      ? std.tax_cents / (std.base_price_cents + std.tax_cents)
      : 0;
  const tax_cents = complimentary ? 0 : Math.round(total_cents * ratio);
  const base_price_cents = complimentary ? 0 : total_cents - tax_cents;

  return sql.begin(async (tx) => {
    await tx`
      select cabana.acquire_hold(
        ${slot.cabana_id}::uuid, ${slot.booking_date}::date, ${slot.block_id}::uuid,
        ${'manager:' + managerId}, 1::int
      )
    `;

    const [c] = await tx<{ id: string }[]>`
      insert into cabana.customers (first_name, last_name, email, phone)
      values (${customer.first_name}, ${customer.last_name}, ${customer.email}, ${customer.phone})
      on conflict (email, phone) do update
        set first_name = excluded.first_name, last_name = excluded.last_name, updated_at = now()
      returning id
    `;

    const [b] = await tx<{ id: string; booking_number: string }[]>`
      insert into cabana.bookings (
        customer_id, cabana_id, booking_date, block_id, guests,
        base_price_cents, tax_cents, total_cents,
        payment_method, payment_status, booking_status,
        special_requests, notes, policy_accepted_at, created_by
      ) values (
        ${c.id}, ${slot.cabana_id}, ${slot.booking_date}, ${slot.block_id}, ${customer.guests},
        ${base_price_cents}, ${tax_cents}, ${total_cents},
        ${payment.method}, ${payment.status}, 'CONFIRMED',
        ${customer.special_requests ?? null}, ${customer.notes ?? null}, now(), ${managerId}
      )
      returning id, booking_number
    `;

    await tx`
      delete from cabana.booking_holds
      where cabana_id = ${slot.cabana_id}::uuid
        and booking_date = ${slot.booking_date}::date
        and block_id = ${slot.block_id}::uuid
    `;

    await tx`
      insert into cabana.audit_log (manager_id, action, entity_type, entity_id, new_value)
      values (${managerId}, 'MANUAL_BOOKING_CREATED', 'booking', ${b.id},
              ${tx.json({
                payment_method: payment.method,
                payment_status: payment.status,
                total_cents,
                custom_price: payment.totalCentsOverride != null,
              })})
    `;

    return { bookingId: b.id, bookingNumber: b.booking_number };
  });
}

export async function attachStripeSession(bookingId: string, sessionId: string) {
  await sql`
    update cabana.bookings set stripe_session_id = ${sessionId}, updated_at = now()
    where id = ${bookingId}
  `;
}

export async function getBookingByNumber(bookingNumber: string) {
  const [row] = await sql<any[]>`
    select b.*, to_char(b.booking_date,'YYYY-MM-DD') as booking_date,
           c.first_name, c.last_name, c.email::text, c.phone,
           cab.name as cabana_name, cab.description as cabana_desc,
           bl.name as block_name, bl.start_time::text, bl.end_time::text
    from cabana.bookings b
    join cabana.customers c on c.id = b.customer_id
    join cabana.cabanas cab on cab.id = b.cabana_id
    join cabana.booking_blocks bl on bl.id = b.block_id
    where b.booking_number = ${bookingNumber}
  `;
  return row ?? null;
}

/** Frees inventory from checkouts that were never paid for. */
export async function expireAbandonedCheckouts() {
  const expired = await sql<{ id: string }[]>`
    update cabana.bookings b
       set booking_status = 'EXPIRED', updated_at = now()
     where b.booking_status = 'HELD'
       and not exists (
         select 1 from cabana.booking_holds h
         where h.session_id = b.id::text and h.expires_at > now()
       )
    returning b.id
  `;
  const [{ expire_holds: released }] = await sql<{ expire_holds: number }[]>`
    select cabana.expire_holds()
  `;
  return { bookingsExpired: expired.length, holdsReleased: released };
}
