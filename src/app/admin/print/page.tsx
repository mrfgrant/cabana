import { requireManager } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { blockRange, longDate, money, todayInVenueTz } from '@/lib/format';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

interface Row {
  cabana_name: string;
  cabana_desc: string | null;
  max_guests: number;
  block_name: string;
  start_time: string;
  end_time: string;
  sort_block: number;
  sort_cabana: number;
  state: string;
  booking_number: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  guests: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_status: string | null;
  special_requests: string | null;
  notes: string | null;
  block_reason: string | null;
}

export default async function PrintSheet({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireManager();
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayInVenueTz();

  const [settings, rows] = await Promise.all([
    getSettings(),
    sql<Row[]>`
      select cab.name as cabana_name, cab.description as cabana_desc, cab.max_guests,
             bl.name as block_name, bl.start_time::text, bl.end_time::text,
             bl.sort_order as sort_block, cab.sort_order as sort_cabana,
             case
               when bk.id is not null then 'BOOKED'
               when bs.id is not null then 'BLOCKED'
               else 'OPEN'
             end as state,
             bk.booking_number, c.first_name, c.last_name, c.phone, bk.guests,
             bk.total_cents, bk.payment_method::text, bk.payment_status::text,
             bk.special_requests, bk.notes, bs.reason as block_reason
      from cabana.cabanas cab
      cross join cabana.booking_blocks bl
      left join cabana.bookings bk
        on bk.cabana_id = cab.id and bk.block_id = bl.id
       and bk.booking_date = ${date}::date and bk.booking_status = 'CONFIRMED'
      left join cabana.customers c on c.id = bk.customer_id
      left join cabana.blocked_slots bs
        on bs.cabana_id = cab.id and bs.block_id = bl.id and bs.booking_date = ${date}::date
      where cab.active and bl.active
      order by bl.sort_order, cab.sort_order
    `,
  ]);

  const seatings = [...new Set(rows.map((r) => `${r.start_time}|${r.end_time}`))];
  const booked = rows.filter((r) => r.state === 'BOOKED');
  const guestCount = booked.reduce((sum, r) => sum + (r.guests ?? 0), 0);
  const due = booked
    .filter((r) => r.payment_status !== 'PAID')
    .reduce((sum, r) => sum + (r.total_cents ?? 0), 0);

  return (
    <div className="sheet">
      <div className="no-print quick">
        <PrintButton />
        <a className="btn" href={`/admin/print?date=${date}`}>Reload</a>
        <a className="btn" href="/admin">Back to today</a>
      </div>

      <header className="sheet-head">
        <div>
          <div className="sheet-title">Cabana sheet</div>
          <div className="sheet-date">{longDate(date)}</div>
        </div>
        <div className="sheet-meta">
          <div>{settings.business.name}</div>
          <div>{booked.length} booked, {guestCount} guests</div>
          {due > 0 && <div className="sheet-due">Collect on arrival: {money(due)}</div>}
        </div>
      </header>

      {seatings.map((key) => {
        const [start, end] = key.split('|');
        const cells = rows.filter((r) => `${r.start_time}|${r.end_time}` === key);
        const takenHere = cells.filter((c) => c.state === 'BOOKED').length;

        return (
          <section className="seating" key={key}>
            <h2 className="seating-head">
              <span>{blockRange(start, end)}</span>
              <span className="seating-count">{takenHere} of {cells.length} booked</span>
            </h2>

            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="c-arrived">In</th>
                  <th className="c-cabana">Cabana</th>
                  <th className="c-guest">Guest</th>
                  <th className="c-party">Party</th>
                  <th className="c-phone">Phone</th>
                  <th className="c-pay">Payment</th>
                  <th className="c-notes">Requests and notes</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => {
                  const open = c.state === 'OPEN';
                  const blockedSlot = c.state === 'BLOCKED';
                  return (
                    <tr key={`${c.cabana_name}-${key}`} className={open ? 'is-open' : ''}>
                      <td className="c-arrived">{!open && !blockedSlot ? <span className="tick" /> : ''}</td>
                      <td className="c-cabana">
                        <strong>{c.cabana_name}</strong>
                        {c.cabana_desc && <div className="muted">{c.cabana_desc}</div>}
                      </td>
                      <td className="c-guest">
                        {blockedSlot ? (
                          <em>Blocked{c.block_reason ? `: ${c.block_reason}` : ''}</em>
                        ) : open ? (
                          <em className="muted">Open</em>
                        ) : (
                          <>
                            <strong>{c.first_name} {c.last_name}</strong>
                            <div className="muted">{c.booking_number}</div>
                          </>
                        )}
                      </td>
                      <td className="c-party">{c.guests ?? ''}</td>
                      <td className="c-phone">{c.phone ?? ''}</td>
                      <td className="c-pay">
                        {open || blockedSlot ? '' : c.payment_status === 'PAID' ? (
                          <>Paid<div className="muted">{c.payment_method}</div></>
                        ) : (
                          <strong className="owed">COLLECT {money(c.total_cents ?? 0)}</strong>
                        )}
                      </td>
                      <td className="c-notes">
                        {c.special_requests && <div>{c.special_requests}</div>}
                        {c.notes && <div className="muted">{c.notes}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <footer className="sheet-foot">
        <div>
          Every cabana includes a bottle of champagne with four flutes and a dedicated server.
          Non-refundable. No outside food or drink except cake.
        </div>
        <div className="muted">
          Printed from the manager portal. Book walk-ins under New booking so the sheet stays right.
        </div>
      </footer>
    </div>
  );
}
