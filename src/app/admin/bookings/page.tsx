import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { listBookings } from '@/lib/manage';
import { blockRange, longDate, money } from '@/lib/format';
import { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

const STATUSES = ['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'HELD'];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  await requireManager();
  const { q, status, from, to } = await searchParams;

  const bookings = await listBookings({
    search: q?.trim() || undefined,
    status: STATUSES.includes(status ?? '') ? status : undefined,
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <>
      <h1>Bookings</h1>
      <p className="sub">{bookings.length} shown. Search by name, phone, email, or booking number.</p>

      <AreaNote title="bookings">
        <p>
          Every reservation, online and taken at the door. Search by guest name, phone, email, or
          booking number, then open one to reschedule, cancel, or see what was sent to the guest.
        </p>
        <p>
          Abandoned checkouts are hidden here. <strong>Held</strong> means a guest is mid-payment.
        </p>
      </AreaNote>

      <form className="panel" method="get">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="Smith, 770-555-0134, 1942-10001" />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0] + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Apply
        </button>{' '}
        <Link className="btn" href="/admin/bookings">
          Clear
        </Link>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Date</th>
              <th>Cabana</th>
              <th>Time</th>
              <th>Guest</th>
              <th>Party</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/admin/bookings/${b.booking_number}`}>{b.booking_number}</Link>
                </td>
                <td>{longDate(b.booking_date)}</td>
                <td>{b.cabana_name}</td>
                <td>{blockRange(b.start_time, b.end_time)}</td>
                <td>
                  {b.first_name} {b.last_name}
                </td>
                <td>{b.guests}</td>
                <td>
                  {money(b.total_cents)}
                  <br />
                  <span className={`tag ${b.payment_status === 'PAID' ? 'tag-paid' : ''}`}>
                    {b.payment_method}
                  </span>
                </td>
                <td>
                  <span className={`tag tag-${b.booking_status.toLowerCase()}`}>{b.booking_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bookings.length === 0 && <p className="sub">No bookings match. Widen the filters.</p>}
    </>
  );
}
