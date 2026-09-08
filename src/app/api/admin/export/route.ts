import { getSession } from '@/lib/auth';
import { listBookings } from '@/lib/manage';
import { blockRange } from '@/lib/format';

export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const params = new URL(req.url).searchParams;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const bookings = await listBookings({ from, to, limit: 5000 });

  const header = [
    'Booking', 'Date', 'Cabana', 'Time', 'First name', 'Last name', 'Email', 'Phone',
    'Guests', 'Base', 'Tax', 'Total', 'Payment method', 'Payment status', 'Booking status',
    'Created', 'Created by',
  ];

  const rows = bookings.map((b) => [
    b.booking_number, b.booking_date, b.cabana_name,
    blockRange(b.start_time, b.end_time),
    b.first_name, b.last_name, b.email, b.phone, b.guests,
    (b.base_price_cents / 100).toFixed(2),
    (b.tax_cents / 100).toFixed(2),
    (b.total_cents / 100).toFixed(2),
    b.payment_method, b.payment_status, b.booking_status,
    new Date(b.created_at).toISOString(),
    b.created_by_name ?? 'Online booking',
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="1942-bookings-${from ?? 'all'}-to-${to ?? 'all'}.csv"`,
    },
  });
}
