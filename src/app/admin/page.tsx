import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { dashboardStats, calendarGrid } from '@/lib/manage';
import { blockRange, longDate, money, todayInVenueTz } from '@/lib/format';
import Hint, { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  await requireManager();
  const today = todayInVenueTz();
  const [stats, grid] = await Promise.all([dashboardStats(today), calendarGrid(today, today)]);

  const occupied = grid.filter((g) => g.state === 'BOOKED').length;
  const blocked = grid.filter((g) => g.state === 'BLOCKED').length;
  const open = stats.totalSlots - occupied - blocked;

  return (
    <>
      <h1>{longDate(today)}</h1>
      <p className="sub">Tonight at a glance.</p>

      <div className="stats">
        <div className="stat">
          <div className="v">{stats.bookings}</div>
          <div className="k">Bookings tonight</div>
        </div>
        <div className="stat">
          <div className="v">{money(stats.revenueCents)}</div>
          <div className="k">Collected<Hint label="Collected">Money actually taken for today, online and on the POS. Reservations recorded as not yet collected are excluded.</Hint></div>
        </div>
        <div className="stat">
          <div className="v">{open}</div>
          <div className="k">Cabanas open<Hint label="Cabanas open">Slots still for sale today, counting every cabana across every seating. Three cabanas over four seatings is twelve.</Hint></div>
        </div>
        <div className="stat">
          <div className="v">{occupied}</div>
          <div className="k">Cabanas taken</div>
        </div>
      </div>

      <div className="quick">
        <Link className="btn btn-primary" href="/admin/new">
          New booking
        </Link>
        <Link className="btn" href="/admin/calendar">
          Calendar
        </Link>
        <Link className="btn" href="/admin/bookings">
          All bookings
        </Link>
      </div>

      <h2>Tonight</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cabana</th>
              <th>Time</th>
              <th>Guest</th>
              <th>Party</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {grid.map((g) => (
              <tr key={`${g.cabana_id}-${g.block_id}`}>
                <td>{g.cabana_name}</td>
                <td>{blockRange(g.start_time, g.end_time)}</td>
                <td>
                  {g.state === 'BOOKED' ? (
                    <Link href={`/admin/bookings/${g.booking_number}`}>{g.customer}</Link>
                  ) : g.state === 'BLOCKED' ? (
                    <span className="tag tag-blocked">Blocked{g.block_reason ? `: ${g.block_reason}` : ''}</span>
                  ) : g.state === 'HELD' ? (
                    <span className="tag">Checking out</span>
                  ) : (
                    <span style={{ color: 'var(--paper-dim)' }}>Open</span>
                  )}
                </td>
                <td>{g.guests ?? ''}</td>
                <td>{g.booking_number ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Coming up</h2>
      {stats.upcoming.length === 0 ? (
        <p className="sub">No reservations booked past tonight yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Cabana</th>
                <th>Time</th>
                <th>Guest</th>
                <th>Booking</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcoming.map((b) => (
                <tr key={b.id}>
                  <td>{longDate(b.booking_date)}</td>
                  <td>{b.cabana_name}</td>
                  <td>{blockRange(b.start_time, b.end_time)}</td>
                  <td>
                    {b.first_name} {b.last_name}
                  </td>
                  <td>
                    <Link href={`/admin/bookings/${b.booking_number}`}>{b.booking_number}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
