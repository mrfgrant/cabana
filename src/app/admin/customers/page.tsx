import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { sql } from '@/lib/db';
import { blockRange, longDate, money } from '@/lib/format';
import { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireManager();
  const { q } = await searchParams;
  const term = q?.trim();

  const customers = await sql<any[]>`
    select c.id, c.first_name, c.last_name, c.email::text, c.phone,
           count(b.id) filter (where b.booking_status = 'CONFIRMED')::int as visits,
           coalesce(sum(b.total_cents) filter (where b.payment_status = 'PAID'), 0)::int as spend
    from cabana.customers c
    left join cabana.bookings b on b.customer_id = c.id
    ${
      term
        ? sql`where c.first_name ilike ${'%' + term + '%'}
                 or c.last_name ilike ${'%' + term + '%'}
                 or c.email::text ilike ${'%' + term + '%'}
                 or c.phone ilike ${'%' + term + '%'}
                 or exists (select 1 from cabana.bookings bb
                            where bb.customer_id = c.id
                              and bb.booking_number ilike ${'%' + term + '%'})`
        : sql``
    }
    group by c.id
    order by c.last_name, c.first_name
    limit 100
  `;

  const ids = customers.map((c) => c.id);
  const bookings = ids.length
    ? await sql<any[]>`
        select b.customer_id, b.booking_number, b.booking_status::text,
               to_char(b.booking_date,'YYYY-MM-DD') as booking_date,
               b.total_cents, cab.name as cabana_name,
               bl.start_time::text, bl.end_time::text
        from cabana.bookings b
        join cabana.cabanas cab on cab.id = b.cabana_id
        join cabana.booking_blocks bl on bl.id = b.block_id
        where b.customer_id = any(${ids}) and b.booking_status <> 'EXPIRED'
        order by b.booking_date desc
      `
    : [];

  return (
    <>
      <h1>Customers</h1>
      <p className="sub">{customers.length} shown.</p>

      <AreaNote title="customers">
        <p>
          Everyone who has ever booked, with how many times they have come and what they have spent.
        </p>
        <p>
          Worth a look before a big party arrives: a guest on their fourth visit should be
          recognised as one. Visits count confirmed reservations only.
        </p>
      </AreaNote>

      <form className="panel" method="get">
        <div className="field">
          <label htmlFor="q">Search by name, phone, email, or booking number</label>
          <input id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <button className="btn btn-primary" type="submit">Search</button>{' '}
        <Link className="btn" href="/admin/customers">Clear</Link>
      </form>

      {customers.map((c) => (
        <div className="panel" key={c.id}>
          <h3>{c.first_name} {c.last_name}</h3>
          <div className="detail-grid" style={{ marginBottom: '0.75rem' }}>
            <div><div className="k">Phone</div><div><a href={`tel:${c.phone}`}>{c.phone}</a></div></div>
            <div><div className="k">Email</div><div>{c.email}</div></div>
            <div><div className="k">Visits</div><div>{c.visits}</div></div>
            <div><div className="k">Spent</div><div>{money(c.spend)}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {bookings.filter((b) => b.customer_id === c.id).map((b) => (
                  <tr key={b.booking_number}>
                    <td><Link href={`/admin/bookings/${b.booking_number}`}>{b.booking_number}</Link></td>
                    <td>{longDate(b.booking_date)}</td>
                    <td>{b.cabana_name}</td>
                    <td>{blockRange(b.start_time, b.end_time)}</td>
                    <td>{money(b.total_cents)}</td>
                    <td><span className={`tag tag-${b.booking_status.toLowerCase()}`}>{b.booking_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {customers.length === 0 && <p className="sub">No customers match that search.</p>}
    </>
  );
}
