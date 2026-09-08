import { sql } from './db';
import { getSettings } from './settings';
import { blockRange, e164, longDate, money, shortDate } from './format';

export interface BookingView {
  id: string;
  booking_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  guests: number;
  cabana_name: string;
  cabana_desc: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_cents: number;
  payment_method: string;
  payment_status: string;
}

export type NotificationType =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_CANCELLED'
  | 'DAILY_REPORT';

export async function getBookingView(bookingId: string): Promise<BookingView | null> {
  const [row] = await sql<BookingView[]>`
    select b.id, b.booking_number, c.first_name, c.last_name, c.email::text, c.phone,
           b.guests, cab.name as cabana_name, cab.description as cabana_desc,
           to_char(b.booking_date, 'YYYY-MM-DD') as booking_date,
           bl.start_time::text, bl.end_time::text,
           b.total_cents, b.payment_method::text, b.payment_status::text
    from cabana.bookings b
    join cabana.customers c on c.id = b.customer_id
    join cabana.cabanas cab on cab.id = b.cabana_id
    join cabana.booking_blocks bl on bl.id = b.block_id
    where b.id = ${bookingId}
  `;
  return row ?? null;
}

function venueLine(b: { name: string; address_line1: string; city: string; state: string }) {
  return `${b.name}\n${b.address_line1}\n${b.city}, ${b.state}`;
}

export function customerEmail(v: BookingView, business: ReturnType<typeof Object> & any, policy: any) {
  const subject = `Your ${business.name} Cabana Reservation is Confirmed`;
  const body = [
    `Thank you, ${v.first_name}.`,
    ``,
    `Your cabana reservation is confirmed.`,
    ``,
    `Booking #: ${v.booking_number}`,
    `Cabana: ${v.cabana_name}${v.cabana_desc ? ` - ${v.cabana_desc}` : ''}`,
    `Date: ${longDate(v.booking_date)}`,
    `Time: ${blockRange(v.start_time, v.end_time)}`,
    `Guests: ${v.guests}`,
    `Total paid: ${money(v.total_cents)} (${v.payment_method})`,
    ``,
    venueLine(business),
    business.phone ? `Phone: ${business.phone}` : '',
    business.email ? `Email: ${business.email}` : '',
    ``,
    policy.text,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, body };
}

export function customerSms(v: BookingView, business: any) {
  return (
    `${business.name}: Your cabana reservation is confirmed. ` +
    `${v.cabana_name}, ${shortDate(v.booking_date)}, ${blockRange(v.start_time, v.end_time)}. ` +
    `Total paid: ${money(v.total_cents)}. ${business.address_line1}, ${business.city}, ${business.state}. ` +
    `Booking #${v.booking_number}.`
  );
}

function adminLink(bookingNumber: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return site ? `${site}/admin/bookings/${bookingNumber}` : '';
}

export function managerEmail(v: BookingView) {
  const subject = `New cabana booking ${v.booking_number}`;
  const link = adminLink(v.booking_number);
  const body = [
    `NEW CABANA BOOKING`,
    ``,
    `Customer: ${v.first_name} ${v.last_name}`,
    `Cabana: ${v.cabana_name}${v.cabana_desc ? ` - ${v.cabana_desc}` : ''}`,
    `Date: ${longDate(v.booking_date)}`,
    `Time: ${blockRange(v.start_time, v.end_time)}`,
    `Guests: ${v.guests}`,
    `Amount: ${money(v.total_cents)}`,
    `Phone: ${v.phone}`,
    `Email: ${v.email}`,
    `Payment: ${v.payment_method} (${v.payment_status})`,
    `Booking #: ${v.booking_number}`,
    ...(link ? ['', 'Open in the manager portal:', link] : []),
  ].join('\n');
  return { subject, body };
}

export function managerSms(v: BookingView, business: any) {
  return [
    `NEW BOOKING - ${business.name}`,
    `${v.first_name} ${v.last_name}`,
    v.cabana_name,
    shortDate(v.booking_date),
    blockRange(v.start_time, v.end_time),
    `${v.guests} guests`,
    `${money(v.total_cents)} ${v.payment_status}`,
    `Booking #${v.booking_number}`,
    ...(adminLink(v.booking_number) ? [adminLink(v.booking_number)] : []),
  ].join('\n');
}

interface Outgoing {
  bookingId: string | null;
  recipient: string;
  recipientType: 'customer' | 'manager';
  type: NotificationType;
  channel: 'EMAIL' | 'SMS';
  subject?: string;
  body: string;
}

/** Sends if credentials are configured, otherwise records what would have been sent. */
async function dispatch(n: Outgoing, mode: 'simulated' | 'live') {
  let status: 'SENT' | 'FAILED' | 'SIMULATED' = 'SIMULATED';
  let error: string | null = null;
  let providerId: string | null = null;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  if (mode === 'live') {
    try {
      if (n.channel === 'EMAIL') {
        const key = process.env.RESEND_API_KEY;
        if (!key) throw new Error('RESEND_API_KEY not configured');
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM,
            to: n.recipient,
            subject: n.subject,
            text: n.body,
          }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 400)}`);
        providerId = ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null;
      } else {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        if (!sid || !token) throw new Error('Twilio credentials not configured');
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            // Guests type phones however they like. Twilio requires E.164.
            To: e164(n.recipient),
            From: process.env.TWILIO_FROM ?? '',
            Body: n.body,
            // Ask the carrier to report what actually happened, not just that
            // Twilio accepted the message.
            ...(site ? { StatusCallback: `${site}/api/webhooks/twilio` } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 400)}`);
        providerId = ((await res.json().catch(() => ({}))) as { sid?: string }).sid ?? null;
      }
      status = 'SENT';
    } catch (e) {
      status = 'FAILED';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await sql`
    insert into cabana.notifications
      (booking_id, recipient, recipient_type, notification_type, channel, status,
       subject, body, sent_at, error_message, provider_id, delivery_status)
    values (${n.bookingId}, ${n.recipient}, ${n.recipientType}, ${n.type}, ${n.channel},
            ${status}, ${n.subject ?? null}, ${n.body},
            ${status === 'FAILED' ? null : new Date()}, ${error}, ${providerId},
            ${status === 'SENT' ? 'accepted' : null})
  `;
}

/**
 * Fan out confirmation notices. Never throws: a failed SMS must not
 * undo a paid reservation.
 */
export async function sendBookingNotifications(
  bookingId: string,
  type: NotificationType = 'BOOKING_CONFIRMED',
) {
  try {
    const [v, settings] = await Promise.all([getBookingView(bookingId), getSettings()]);
    if (!v) return;
    const { business, policy, notifications: cfg } = settings;
    const mode = cfg.mode ?? 'simulated';

    const managers = await sql<{ name: string; email: string; phone: string }[]>`
      select name, email::text, phone from cabana.managers where active
    `;

    const queue: Outgoing[] = [];

    if (cfg.customer_email) {
      const { subject, body } = customerEmail(v, business, policy);
      queue.push({
        bookingId, recipient: v.email, recipientType: 'customer',
        type, channel: 'EMAIL', subject, body,
      });
    }
    if (cfg.customer_sms) {
      queue.push({
        bookingId, recipient: v.phone, recipientType: 'customer',
        type, channel: 'SMS', body: customerSms(v, business),
      });
    }
    for (const m of managers) {
      if (cfg.manager_email) {
        const { subject, body } = managerEmail(v);
        queue.push({
          bookingId, recipient: m.email, recipientType: 'manager',
          type, channel: 'EMAIL', subject, body,
        });
      }
      if (cfg.manager_sms) {
        queue.push({
          bookingId, recipient: m.phone, recipientType: 'manager',
          type, channel: 'SMS', body: managerSms(v, business),
        });
      }
    }

    for (const n of queue) await dispatch(n, mode);
  } catch (e) {
    console.error('notification fan-out failed', e);
  }
}

export async function resendNotification(notificationId: string) {
  const [n] = await sql<any[]>`
    select * from cabana.notifications where id = ${notificationId}
  `;
  if (!n) return false;
  const settings = await getSettings();
  await dispatch(
    {
      bookingId: n.booking_id,
      recipient: n.recipient,
      recipientType: n.recipient_type,
      type: n.notification_type,
      channel: n.channel,
      subject: n.subject,
      body: n.body,
    },
    settings.notifications.mode ?? 'simulated',
  );
  return true;
}
