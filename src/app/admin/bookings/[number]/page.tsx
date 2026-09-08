import { notFound } from 'next/navigation';
import { requireManager } from '@/lib/auth';
import { getBooking, getBookingHistory, activeCabanasAndBlocks } from '@/lib/manage';
import { blockRange, longDate, money, shortDate, todayInVenueTz } from '@/lib/format';
import RescheduleForm from '@/components/RescheduleForm';
import CancelForm from '@/components/CancelForm';
import { resendNotificationAction } from '../../actions';
import Hint, { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

export default async function BookingDetail({ params }: { params: Promise<{ number: string }> }) {
  await requireManager();
  const { number } = await params;
  const booking = await getBooking(decodeURIComponent(number));
  if (!booking) notFound();

  const [history, { cabanas, blocks }] = await Promise.all([
    getBookingHistory(booking.id),
    activeCabanasAndBlocks(),
  ]);

  const failed = history.notifications.filter((n) => n.status === 'FAILED').length;

  return (
    <>
      <h1>{booking.booking_number}</h1>
      <p className="sub">
        <span className={`tag tag-${booking.booking_status.toLowerCase()}`}>{booking.booking_status}</span>{' '}
        <span className={`tag ${booking.payment_status === 'PAID' ? 'tag-paid' : ''}`}>
          {booking.payment_method} · {booking.payment_status}
        </span>
      </p>

      <AreaNote title="this reservation">
        <p>
          Everything about one booking: the guest, what they paid, anything they asked for, and
          every message the system sent them.
        </p>
        <p>
          <strong>Move</strong> keeps the original payment and does not charge again.{' '}
          <strong>Cancel</strong> frees the cabana but never refunds anyone: do that yourself on the
          POS or in Stripe.
        </p>
      </AreaNote>

      <div className="panel">
        <div className="detail-grid">
          <div>
            <div className="k">Guest</div>
            <div>
              {booking.first_name} {booking.last_name}
            </div>
          </div>
          <div>
            <div className="k">Phone</div>
            <div>
              <a href={`tel:${booking.phone}`}>{booking.phone}</a>
            </div>
          </div>
          <div>
            <div className="k">Email</div>
            <div>
              <a href={`mailto:${booking.email}`}>{booking.email}</a>
            </div>
          </div>
          <div>
            <div className="k">Party size</div>
            <div>{booking.guests}</div>
          </div>
          <div>
            <div className="k">Cabana</div>
            <div>
              {booking.cabana_name}
              {booking.cabana_desc ? ` · ${booking.cabana_desc}` : ''}
            </div>
          </div>
          <div>
            <div className="k">Date</div>
            <div>{longDate(booking.booking_date)}</div>
          </div>
          <div>
            <div className="k">Time</div>
            <div>{blockRange(booking.start_time, booking.end_time)}</div>
          </div>
          <div>
            <div className="k">Base</div>
            <div>{money(booking.base_price_cents)}</div>
          </div>
          <div>
            <div className="k">Sales tax</div>
            <div>{money(booking.tax_cents)}</div>
          </div>
          <div>
            <div className="k">Total</div>
            <div>{money(booking.total_cents)}</div>
          </div>
          <div>
            <div className="k">Created</div>
            <div>{new Date(booking.created_at).toLocaleString('en-US')}</div>
          </div>
          <div>
            <div className="k">Created by</div>
            <div>{booking.created_by_name ?? 'Online booking'}</div>
          </div>
        </div>

        {(booking.special_requests || booking.notes) && (
          <div style={{ marginTop: '1rem' }}>
            {booking.special_requests && (
              <>
                <div className="k" style={{ color: 'var(--paper-dim)', fontSize: '0.75rem' }}>
                  Guest requests
                </div>
                <div className="msg-body">{booking.special_requests}</div>
              </>
            )}
            {booking.notes && (
              <>
                <div className="k" style={{ color: 'var(--paper-dim)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
                  Internal notes
                </div>
                <div className="msg-body">{booking.notes}</div>
              </>
            )}
          </div>
        )}
      </div>

      {booking.booking_status === 'CONFIRMED' && (
        <>
          <h2>Move this reservation</h2>
          <p className="sub">
            The original payment carries over. No second charge and no refund is created.
          </p>
          <RescheduleForm
            bookingNumber={booking.booking_number}
            cabanas={cabanas}
            blocks={blocks}
            current={{
              cabana_id: booking.cabana_id,
              block_id: booking.block_id,
              booking_date: booking.booking_date,
            }}
            today={todayInVenueTz()}
          />

          <h2>Cancel</h2>
          <p className="sub">
            Releases the cabana and keeps the record. Reservations are non-refundable, so no refund
            is issued. Refund separately in Stripe if you decide to make an exception.
          </p>
          <CancelForm bookingNumber={booking.booking_number} />
        </>
      )}

      {history.reschedules.length > 0 && (
        <>
          <h2>Reschedule history</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                  <th>Approved by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {history.reschedules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.original_cabana}
                      <br />
                      {shortDate(r.original_date)}
                      <br />
                      {blockRange(r.original_start, r.original_end)}
                    </td>
                    <td>
                      {r.new_cabana}
                      <br />
                      {shortDate(r.new_date)}
                      <br />
                      {blockRange(r.new_start, r.new_end)}
                    </td>
                    <td>{r.reason ?? ''}</td>
                    <td>{r.approved_by_name ?? ''}</td>
                    <td>{new Date(r.created_at).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history.cancellations.length > 0 && (
        <>
          <h2>Cancellation</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Cancelled by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {history.cancellations.map((c) => (
                  <tr key={c.id}>
                    <td>{c.reason ?? ''}</td>
                    <td>{c.cancelled_by_name ?? ''}</td>
                    <td>{new Date(c.created_at).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Messages</h2>
      <p className="sub">
        {history.notifications.length} sent for this booking
        {failed > 0 ? `, ${failed} failed` : ''}.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Message</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.notifications.map((n) => (
              <tr key={n.id}>
                <td>
                  {n.recipient}
                  <br />
                  <span className="tag">{n.recipient_type}</span>
                </td>
                <td>{n.channel}</td>
                <td>
                  <span className={`tag tag-${n.status.toLowerCase()}`}>{n.status}</span>
                  {n.delivery_status && (
                    <>
                      {' '}
                      <span
                        className={`tag ${
                          n.delivered_at ? 'tag-confirmed' : n.status === 'FAILED' ? 'tag-failed' : ''
                        }`}
                      >
                        {n.delivery_status}
                      </span>
                    </>
                  )}
                  {n.error_message && <div className="msg-body">{n.error_message}</div>}
                </td>
                <td style={{ maxWidth: '22rem' }}>
                  {n.subject && <strong>{n.subject}</strong>}
                  <div className="msg-body">{n.body}</div>
                </td>
                <td>
                  <form action={resendNotificationAction}>
                    <input type="hidden" name="notification_id" value={n.id} />
                    <input type="hidden" name="booking_number" value={booking.booking_number} />
                    <button className="btn btn-sm" type="submit">
                      Resend
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
