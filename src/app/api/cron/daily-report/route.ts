import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { blockRange, longDate, money, todayInVenueTz } from '@/lib/format';
import { calendarGrid } from '@/lib/manage';

export const dynamic = 'force-dynamic';

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? todayInVenueTz();

  const settings = await getSettings();
  const grid = await calendarGrid(date, date);

  const [totals] = await sql<{ bookings: string; revenue: string }[]>`
    select count(*)::text as bookings,
           coalesce(sum(total_cents) filter (where payment_status = 'PAID'),0)::text as revenue
    from cabana.bookings
    where booking_date = ${date}::date and booking_status = 'CONFIRMED'
  `;

  type Cell = (typeof grid)[number];
  const byBlock = new Map<string, Cell[]>();
  for (const cell of grid) {
    const key = blockRange(cell.start_time, cell.end_time);
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(cell);
  }

  const lines: string[] = [
    'DAILY CABANA REPORT',
    '',
    longDate(date),
    '',
    `Total bookings: ${totals.bookings}`,
    `Total revenue: ${money(Number(totals.revenue))}`,
  ];

  for (const [time, cells] of byBlock) {
    lines.push('', time, '');
    for (const c of cells) {
      if (c.state === 'BOOKED') {
        lines.push(`${c.cabana_name}  ${c.customer}  ${c.guests} guests  ${c.booking_number}`);
      } else if (c.state === 'BLOCKED') {
        lines.push(`${c.cabana_name}  BLOCKED${c.block_reason ? ` - ${c.block_reason}` : ''}`);
      } else {
        lines.push(`${c.cabana_name}  AVAILABLE`);
      }
    }
  }

  const body = lines.join('\n');
  const subject = `Daily cabana report — ${longDate(date)}`;

  const managers = await sql<{ name: string; email: string; phone: string }[]>`
    select name, email::text, phone from cabana.managers where active
  `;

  const mode = settings.notifications.mode ?? 'simulated';
  let sent = 0;

  for (const m of managers) {
    const targets: { channel: 'EMAIL' | 'SMS'; to: string }[] = [];
    if (settings.notifications.manager_email) targets.push({ channel: 'EMAIL', to: m.email });
    if (settings.notifications.manager_sms) targets.push({ channel: 'SMS', to: m.phone });

    for (const t of targets) {
      let status: 'SENT' | 'FAILED' | 'SIMULATED' = 'SIMULATED';
      let error: string | null = null;

      if (mode === 'live') {
        try {
          if (t.channel === 'EMAIL') {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: process.env.RESEND_FROM,
                to: t.to,
                subject,
                text: body,
              }),
            });
            if (!res.ok) throw new Error(`Resend ${res.status}`);
          } else {
            const sid = process.env.TWILIO_ACCOUNT_SID;
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  To: t.to,
                  From: process.env.TWILIO_FROM ?? '',
                  Body: body.slice(0, 1500),
                }),
              },
            );
            if (!res.ok) throw new Error(`Twilio ${res.status}`);
          }
          status = 'SENT';
        } catch (e) {
          status = 'FAILED';
          error = e instanceof Error ? e.message : String(e);
        }
      }

      await sql`
        insert into cabana.notifications
          (booking_id, recipient, recipient_type, notification_type, channel, status, subject, body, sent_at, error_message)
        values (null, ${t.to}, 'manager', 'DAILY_REPORT', ${t.channel}, ${status},
                ${t.channel === 'EMAIL' ? subject : null}, ${body},
                ${status === 'FAILED' ? null : new Date()}, ${error})
      `;
      sent += 1;
    }
  }

  return NextResponse.json({ date, managers: managers.length, messages: sent, mode, report: body });
}
