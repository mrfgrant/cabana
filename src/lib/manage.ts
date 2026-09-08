import { sql } from './db';

export interface BookingRow {
  id: string;
  booking_number: string;
  booking_date: string;
  guests: number;
  base_price_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_method: string;
  payment_status: string;
  booking_status: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  special_requests: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  customer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  cabana_id: string;
  cabana_name: string;
  cabana_desc: string | null;
  block_id: string;
  block_name: string;
  start_time: string;
  end_time: string;
}

function bookingSelect() {
  return sql`
  select b.id, b.booking_number,
         to_char(b.booking_date,'YYYY-MM-DD') as booking_date,
         b.guests, b.base_price_cents, b.tax_cents, b.total_cents,
         b.payment_method::text, b.payment_status::text, b.booking_status::text,
         b.stripe_session_id, b.stripe_payment_intent_id,
         b.special_requests, b.notes, b.created_at,
         m.name as created_by_name,
         c.id as customer_id, c.first_name, c.last_name, c.email::text, c.phone,
         cab.id as cabana_id, cab.name as cabana_name, cab.description as cabana_desc,
         bl.id as block_id, bl.name as block_name, bl.start_time::text, bl.end_time::text
  from cabana.bookings b
  join cabana.customers c on c.id = b.customer_id
  join cabana.cabanas cab on cab.id = b.cabana_id
  join cabana.booking_blocks bl on bl.id = b.block_id
  left join cabana.managers m on m.id = b.created_by
  `;
}

export async function listBookings(opts: {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  limit?: number;
}) {
  const { from, to, status, search, limit = 200 } = opts;
  return sql<BookingRow[]>`
    ${bookingSelect()}
    where b.booking_status <> 'EXPIRED'
      ${from ? sql`and b.booking_date >= ${from}::date` : sql``}
      ${to ? sql`and b.booking_date <= ${to}::date` : sql``}
      ${status ? sql`and b.booking_status = ${status}::cabana.booking_status` : sql``}
      ${
        search
          ? sql`and (
              c.first_name ilike ${'%' + search + '%'} or
              c.last_name ilike ${'%' + search + '%'} or
              c.email::text ilike ${'%' + search + '%'} or
              c.phone ilike ${'%' + search + '%'} or
              b.booking_number ilike ${'%' + search + '%'}
            )`
          : sql``
      }
    order by b.booking_date desc, bl.start_time
    limit ${limit}
  `;
}

export async function getBooking(bookingNumber: string): Promise<BookingRow | null> {
  const [row] = await sql<BookingRow[]>`
    ${bookingSelect()} where b.booking_number = ${bookingNumber}
  `;
  return row ?? null;
}

export async function getBookingHistory(bookingId: string) {
  const [reschedules, cancellations, notifications] = await Promise.all([
    sql<any[]>`
      select r.*, to_char(r.original_date,'YYYY-MM-DD') as original_date,
             to_char(r.new_date,'YYYY-MM-DD') as new_date,
             oc.name as original_cabana, nc.name as new_cabana,
             ob.start_time::text as original_start, ob.end_time::text as original_end,
             nb.start_time::text as new_start, nb.end_time::text as new_end,
             m.name as approved_by_name
      from cabana.reschedule_history r
      join cabana.cabanas oc on oc.id = r.original_cabana_id
      join cabana.cabanas nc on nc.id = r.new_cabana_id
      join cabana.booking_blocks ob on ob.id = r.original_block_id
      join cabana.booking_blocks nb on nb.id = r.new_block_id
      left join cabana.managers m on m.id = r.approved_by
      where r.booking_id = ${bookingId}
      order by r.created_at
    `,
    sql<any[]>`
      select ch.*, m.name as cancelled_by_name
      from cabana.cancellation_history ch
      left join cabana.managers m on m.id = ch.cancelled_by
      where ch.booking_id = ${bookingId}
      order by ch.created_at
    `,
    sql<any[]>`
      select id, recipient, recipient_type, notification_type, channel::text,
             status::text, subject, body, sent_at, error_message, created_at,
             provider_id, delivery_status, delivered_at
      from cabana.notifications
      where booking_id = ${bookingId}
      order by created_at
    `,
  ]);
  return { reschedules, cancellations, notifications };
}

/**
 * Moves a booking to new inventory. Original payment is untouched and no
 * second charge is created. Rolls back entirely if the new slot is taken.
 */
export async function rescheduleBooking(
  bookingId: string,
  target: { cabana_id: string; booking_date: string; block_id: string },
  managerId: string,
  reason: string | null,
) {
  return sql.begin(async (tx) => {
    const [current] = await tx<any[]>`
      select cabana_id, to_char(booking_date,'YYYY-MM-DD') as booking_date, block_id, booking_status::text
      from cabana.bookings where id = ${bookingId} for update
    `;
    if (!current) throw new Error('BOOKING_NOT_FOUND');
    if (current.booking_status !== 'CONFIRMED') throw new Error('NOT_CONFIRMED');

    const unchanged =
      current.cabana_id === target.cabana_id &&
      current.booking_date === target.booking_date &&
      current.block_id === target.block_id;
    if (unchanged) throw new Error('SAME_SLOT');

    // Free the old slot first so the uniqueness check sees the true picture.
    await tx`
      update cabana.bookings set booking_status = 'RESCHEDULED' where id = ${bookingId}
    `;

    await tx`
      select cabana.acquire_hold(
        ${target.cabana_id}::uuid, ${target.booking_date}::date, ${target.block_id}::uuid,
        ${'reschedule:' + bookingId}, 1::int
      )
    `;

    await tx`
      update cabana.bookings
         set cabana_id = ${target.cabana_id},
             booking_date = ${target.booking_date},
             block_id = ${target.block_id},
             booking_status = 'CONFIRMED',
             updated_at = now()
       where id = ${bookingId}
    `;

    await tx`
      delete from cabana.booking_holds where session_id = ${'reschedule:' + bookingId}
    `;

    await tx`
      insert into cabana.reschedule_history
        (booking_id, original_date, original_cabana_id, original_block_id,
         new_date, new_cabana_id, new_block_id, reason, approved_by)
      values (${bookingId}, ${current.booking_date}, ${current.cabana_id}, ${current.block_id},
              ${target.booking_date}, ${target.cabana_id}, ${target.block_id},
              ${reason}, ${managerId})
    `;

    await tx`
      insert into cabana.audit_log (manager_id, action, entity_type, entity_id, old_value, new_value)
      values (${managerId}, 'BOOKING_RESCHEDULED', 'booking', ${bookingId},
              ${tx.json(current)}, ${tx.json(target)})
    `;
  });
}

/** Cancels and releases inventory. Never issues a refund. */
export async function cancelBooking(bookingId: string, managerId: string, reason: string | null) {
  return sql.begin(async (tx) => {
    const [current] = await tx<any[]>`
      select booking_status::text from cabana.bookings where id = ${bookingId} for update
    `;
    if (!current) throw new Error('BOOKING_NOT_FOUND');
    if (current.booking_status === 'CANCELLED') return;

    await tx`
      update cabana.bookings set booking_status = 'CANCELLED', updated_at = now()
      where id = ${bookingId}
    `;
    await tx`
      insert into cabana.cancellation_history (booking_id, reason, cancelled_by)
      values (${bookingId}, ${reason}, ${managerId})
    `;
    await tx`
      insert into cabana.audit_log (manager_id, action, entity_type, entity_id, old_value)
      values (${managerId}, 'BOOKING_CANCELLED', 'booking', ${bookingId}, ${tx.json(current)})
    `;
  });
}

export async function blockSlot(
  slot: { cabana_id: string; booking_date: string; block_id: string },
  reason: string | null,
  managerId: string,
) {
  const [confirmed] = await sql<{ count: string }[]>`
    select count(*)::text from cabana.bookings
    where cabana_id = ${slot.cabana_id} and booking_date = ${slot.booking_date}
      and block_id = ${slot.block_id} and booking_status = 'CONFIRMED'
  `;
  if (Number(confirmed.count) > 0) throw new Error('SLOT_BOOKED');

  await sql`
    insert into cabana.blocked_slots (cabana_id, booking_date, block_id, reason, created_by)
    values (${slot.cabana_id}, ${slot.booking_date}, ${slot.block_id}, ${reason}, ${managerId})
    on conflict (cabana_id, booking_date, block_id) do update set reason = excluded.reason
  `;
  await sql`
    insert into cabana.audit_log (manager_id, action, entity_type, entity_id, new_value)
    values (${managerId}, 'SLOT_BLOCKED', 'blocked_slot', null, ${sql.json({ ...slot, reason })})
  `;
}

export async function unblockSlot(blockedId: string, managerId: string) {
  await sql`delete from cabana.blocked_slots where id = ${blockedId}`;
  await sql`
    insert into cabana.audit_log (manager_id, action, entity_type, entity_id)
    values (${managerId}, 'SLOT_UNBLOCKED', 'blocked_slot', ${blockedId})
  `;
}

/** Grid data for the manager calendar: every cabana/block across a date range. */
export async function calendarGrid(from: string, to: string) {
  return sql<
    {
      booking_date: string;
      cabana_id: string;
      cabana_name: string;
      block_id: string;
      block_name: string;
      start_time: string;
      end_time: string;
      state: string;
      booking_number: string | null;
      customer: string | null;
      guests: number | null;
      block_reason: string | null;
      blocked_id: string | null;
    }[]
  >`
    with days as (
      select generate_series(${from}::date, ${to}::date, '1 day')::date as d
    )
    select to_char(days.d,'YYYY-MM-DD') as booking_date,
           cab.id as cabana_id, cab.name as cabana_name,
           bl.id as block_id, bl.name as block_name,
           bl.start_time::text, bl.end_time::text,
           case
             when bk.id is not null then 'BOOKED'
             when bs.id is not null then 'BLOCKED'
             when h.id is not null then 'HELD'
             else 'AVAILABLE'
           end as state,
           bk.booking_number,
           case when bk.id is not null then c.first_name || ' ' || c.last_name end as customer,
           bk.guests,
           bs.reason as block_reason,
           bs.id::text as blocked_id
    from days
    cross join cabana.cabanas cab
    cross join cabana.booking_blocks bl
    left join cabana.bookings bk
      on bk.cabana_id = cab.id and bk.booking_date = days.d
     and bk.block_id = bl.id and bk.booking_status = 'CONFIRMED'
    left join cabana.customers c on c.id = bk.customer_id
    left join cabana.blocked_slots bs
      on bs.cabana_id = cab.id and bs.booking_date = days.d and bs.block_id = bl.id
    left join cabana.booking_holds h
      on h.cabana_id = cab.id and h.booking_date = days.d
     and h.block_id = bl.id and h.expires_at > now()
    where cab.active and bl.active
    order by days.d, cab.sort_order, bl.sort_order
  `;
}

export async function dashboardStats(today: string) {
  const [[stats], upcoming] = await Promise.all([
    sql<{ bookings: string; revenue: string; slots: string }[]>`
      select
        (select count(*) from cabana.bookings
          where booking_date = ${today}::date and booking_status = 'CONFIRMED')::text as bookings,
        (select coalesce(sum(total_cents),0) from cabana.bookings
          where booking_date = ${today}::date and booking_status = 'CONFIRMED'
            and payment_status = 'PAID')::text as revenue,
        ((select count(*) from cabana.cabanas where active) *
         (select count(*) from cabana.booking_blocks where active))::text as slots
    `,
    sql<BookingRow[]>`
      ${bookingSelect()}
      where b.booking_status = 'CONFIRMED' and b.booking_date > ${today}::date
      order by b.booking_date, bl.start_time
      limit 10
    `,
  ]);
  return {
    bookings: Number(stats.bookings),
    revenueCents: Number(stats.revenue),
    totalSlots: Number(stats.slots),
    upcoming,
  };
}

export async function activeCabanasAndBlocks() {
  const [cabanas, blocks] = await Promise.all([
    sql<{ id: string; name: string; description: string | null; max_guests: number }[]>`
      select id, name, description, max_guests from cabana.cabanas where active order by sort_order
    `,
    sql<{ id: string; name: string; start_time: string; end_time: string }[]>`
      select id, name, start_time::text, end_time::text
      from cabana.booking_blocks where active order by sort_order
    `,
  ]);
  return { cabanas, blocks };
}
