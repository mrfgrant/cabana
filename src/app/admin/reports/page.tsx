import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { sql } from '@/lib/db';
import { addDays, blockRange, longDate, money, todayInVenueTz } from '@/lib/format';
import Hint, { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireManager();
  const params = await searchParams;
  const today = todayInVenueTz();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? '') ? params.from! : addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? '') ? params.to! : addDays(today, 30);

  const [[totals], byCabana, byBlock, byDate, byMethod] = await Promise.all([
    sql<any[]>`
      select
        count(*) filter (where booking_status = 'CONFIRMED')::int as confirmed,
        count(*) filter (where booking_status = 'CANCELLED')::int as cancelled,
        (select count(*)::int from cabana.reschedule_history r
          join cabana.bookings b2 on b2.id = r.booking_id
         where b2.booking_date between ${from}::date and ${to}::date) as rescheduled,
        coalesce(sum(total_cents) filter (where payment_status = 'PAID'), 0)::int as revenue,
        coalesce(sum(total_cents) filter (where payment_status = 'PAID' and payment_method = 'STRIPE'), 0)::int as stripe_revenue,
        coalesce(sum(total_cents) filter (where payment_status = 'PAID' and payment_method <> 'STRIPE'), 0)::int as manual_revenue
      from cabana.bookings
      where booking_date between ${from}::date and ${to}::date
        and booking_status <> 'EXPIRED'
    `,
    sql<any[]>`
      select cab.name, count(b.id)::int as bookings,
             coalesce(sum(b.total_cents) filter (where b.payment_status = 'PAID'),0)::int as revenue
      from cabana.cabanas cab
      left join cabana.bookings b on b.cabana_id = cab.id
        and b.booking_date between ${from}::date and ${to}::date
        and b.booking_status = 'CONFIRMED'
      group by cab.id, cab.name, cab.sort_order order by cab.sort_order
    `,
    sql<any[]>`
      select bl.name, bl.start_time::text, bl.end_time::text, count(b.id)::int as bookings,
             coalesce(sum(b.total_cents) filter (where b.payment_status = 'PAID'),0)::int as revenue
      from cabana.booking_blocks bl
      left join cabana.bookings b on b.block_id = bl.id
        and b.booking_date between ${from}::date and ${to}::date
        and b.booking_status = 'CONFIRMED'
      group by bl.id, bl.name, bl.start_time, bl.end_time, bl.sort_order order by bl.sort_order
    `,
    sql<any[]>`
      select to_char(booking_date,'YYYY-MM-DD') as d, count(*)::int as bookings,
             coalesce(sum(total_cents) filter (where payment_status = 'PAID'),0)::int as revenue
      from cabana.bookings
      where booking_date between ${from}::date and ${to}::date and booking_status = 'CONFIRMED'
      group by booking_date order by booking_date desc
    `,
    sql<any[]>`
      select payment_method::text as method, count(*)::int as bookings,
             coalesce(sum(total_cents) filter (where payment_status = 'PAID'),0)::int as revenue
      from cabana.bookings
      where booking_date between ${from}::date and ${to}::date and booking_status = 'CONFIRMED'
      group by payment_method order by count(*) desc
    `,
  ]);

  return (
    <>
      <h1>Reports</h1>
      <p className="sub">
        {longDate(from)} through {longDate(to)}
      </p>

      <AreaNote title="reports">
        <p>
          What sold, where, and when. Pick any date range, then read down the tables: by cabana, by
          seating, by payment method, and by day.
        </p>
        <p>
          This is where pricing decisions come from. If one cabana or one seating consistently
          outsells the rest, that is the one to raise; the one that sits empty is the one to
          discount or close.
        </p>
        <p><strong>Download CSV</strong> gives your bookkeeper every line for the same range.</p>
      </AreaNote>

      <form className="panel" method="get">
        <div className="row">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={to} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit">
          Apply
        </button>{' '}
        <Link className="btn" href={`/api/admin/export?from=${from}&to=${to}`}>
          Download CSV
        </Link>
      </form>

      <div className="stats">
        <div className="stat">
          <div className="v">{totals.confirmed}</div>
          <div className="k">Reservations</div>
        </div>
        <div className="stat">
          <div className="v">{money(totals.revenue)}</div>
          <div className="k">Revenue collected<Hint label="Revenue collected">Only reservations marked as paid. Anything recorded as not yet collected is left out, so this matches your deposits.</Hint></div>
        </div>
        <div className="stat">
          <div className="v">{totals.cancelled}</div>
          <div className="k">Cancelled</div>
        </div>
        <div className="stat">
          <div className="v">{totals.rescheduled}</div>
          <div className="k">Rescheduled</div>
        </div>
        <div className="stat">
          <div className="v">{money(totals.stripe_revenue)}</div>
          <div className="k">Through Stripe</div>
        </div>
        <div className="stat">
          <div className="v">{money(totals.manual_revenue)}</div>
          <div className="k">Taken in house<Hint label="Taken in house">Bookings a manager entered and charged on the POS or took in cash, rather than online card payments.</Hint></div>
        </div>
      </div>

      <h2>By cabana</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cabana</th>
              <th>Reservations</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byCabana.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.bookings}</td>
                <td>{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>By seating</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Reservations</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byBlock.map((r) => (
              <tr key={r.name}>
                <td>{blockRange(r.start_time, r.end_time)}</td>
                <td>{r.bookings}</td>
                <td>{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>By payment method</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Reservations</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byMethod.map((r) => (
              <tr key={r.method}>
                <td>{r.method}</td>
                <td>{r.bookings}</td>
                <td>{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>By night</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reservations</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byDate.map((r) => (
              <tr key={r.d}>
                <td>{longDate(r.d)}</td>
                <td>{r.bookings}</td>
                <td>{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {byDate.length === 0 && <p className="sub">No reservations in this range.</p>}
    </>
  );
}
