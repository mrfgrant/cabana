import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { activeCabanasAndBlocks, calendarGrid } from '@/lib/manage';
import { addDays, blockRange, longDate, shortDate, todayInVenueTz } from '@/lib/format';
import BlockSlotForm from '@/components/BlockSlotForm';
import { AreaNote } from '@/components/Hint';
import { unblockSlotAction } from '../actions';

export const dynamic = 'force-dynamic';

type View = 'day' | 'week' | 'month';

function range(view: View, anchor: string) {
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') return { from: anchor, to: addDays(anchor, 6) };
  return { from: anchor, to: addDays(anchor, 29) };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireManager();
  const params = await searchParams;
  const view = (['day', 'week', 'month'].includes(params.view ?? '') ? params.view : 'week') as View;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayInVenueTz();
  const { from, to } = range(view, anchor);

  const [grid, { cabanas, blocks }] = await Promise.all([
    calendarGrid(from, to),
    activeCabanasAndBlocks(),
  ]);

  const days = [...new Set(grid.map((g) => g.booking_date))];
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30;

  return (
    <>
      <h1>Calendar</h1>
      <p className="sub">
        {longDate(from)}
        {from !== to ? ` through ${longDate(to)}` : ''}
      </p>

      <AreaNote title="the calendar">
        <p>
          Look ahead a day, a week, or a month. Green is sold, grey is blocked, plain is open.
        </p>
        <p>
          Use <strong>Block a cabana</strong> at the bottom for a private event, a repair, or bad
          weather. Blocked slots vanish from the public site immediately and cannot be purchased.
          You cannot block a slot that is already sold: cancel or move that reservation first.
        </p>
      </AreaNote>

      <div className="quick">
        {(['day', 'week', 'month'] as View[]).map((v) => (
          <Link
            key={v}
            className={`btn btn-sm${v === view ? ' btn-primary' : ''}`}
            href={`/admin/calendar?view=${v}&date=${anchor}`}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </Link>
        ))}
        <Link className="btn btn-sm" href={`/admin/calendar?view=${view}&date=${addDays(anchor, -step)}`}>
          Back
        </Link>
        <Link className="btn btn-sm" href={`/admin/calendar?view=${view}&date=${todayInVenueTz()}`}>
          Today
        </Link>
        <Link className="btn btn-sm" href={`/admin/calendar?view=${view}&date=${addDays(anchor, step)}`}>
          Forward
        </Link>
      </div>

      {days.map((day) => {
        const cells = grid.filter((g) => g.booking_date === day);
        const taken = cells.filter((c) => c.state === 'BOOKED').length;
        return (
          <div className="cal-day" key={day}>
            <div className="cal-day-head">
              <span className="d">{longDate(day)}</span>
              <span className="n">
                {taken} of {cells.length} booked
              </span>
            </div>
            {cabanas.map((cab) => (
              <div key={cab.id} style={{ display: 'contents' }}>
                <div className="cal-cabana">{cab.name}</div>
                <div className="cal-grid">
                  {cells
                    .filter((c) => c.cabana_id === cab.id)
                    .map((c) => (
                      <div
                        key={c.block_id}
                        className={`cal-cell is-${c.state.toLowerCase()}`}
                      >
                        <div className="slot-label">{blockRange(c.start_time, c.end_time)}</div>
                        <div className="who">
                          {c.state === 'BOOKED' && (
                            <Link href={`/admin/bookings/${c.booking_number}`}>
                              {c.customer} ({c.guests})
                            </Link>
                          )}
                          {c.state === 'BLOCKED' && (
                            <>
                              <span className="tag tag-blocked">
                                Blocked{c.block_reason ? `: ${c.block_reason}` : ''}
                              </span>
                              <form action={unblockSlotAction} style={{ marginTop: '0.4rem' }}>
                                <input type="hidden" name="blocked_id" value={c.blocked_id ?? ''} />
                                <button className="btn btn-sm" type="submit">
                                  Unblock
                                </button>
                              </form>
                            </>
                          )}
                          {c.state === 'HELD' && <span className="tag">Checking out</span>}
                          {c.state === 'AVAILABLE' && <span>Open</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <h2>Block a cabana</h2>
      <p className="sub">
        Blocked slots show as unavailable to the public and cannot be purchased.
      </p>
      <BlockSlotForm cabanas={cabanas} blocks={blocks} defaultDate={anchor} today={todayInVenueTz()} />
    </>
  );
}
