import { notFound } from 'next/navigation';
import { getBookingByNumber } from '@/lib/bookings';
import { getSettings } from '@/lib/settings';
import { blockRange, longDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Confirmation({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const booking = await getBookingByNumber(decodeURIComponent(number));
  if (!booking) notFound();

  const { business } = await getSettings();
  const confirmed = booking.booking_status === 'CONFIRMED';

  return (
    <main>
      <header className="hero">
        <div className="sign">
          <div className="sign-mark" role="img" aria-label="1942 On The Square" />
        </div>
      </header>

      <div className="shell">
        {confirmed ? (
          <>
            <div className="confirm-mark">Confirmed</div>
            <h1 className="confirm-title">Thank you, {booking.first_name}.</h1>
          </>
        ) : (
          <>
            <div className="confirm-mark">Payment pending</div>
            <h1 className="confirm-title">We have not received payment yet.</h1>
            <p className="footnote">If you just paid, refresh in a moment.</p>
          </>
        )}

        <div className="receipt">
          <div className="line">
            <span className="label">Booking</span>
            <span className="val num">{booking.booking_number}</span>
          </div>
          <div className="line">
            <span className="label">Cabana</span>
            <span className="val">
              {booking.cabana_name}
              {booking.cabana_desc ? ` - ${booking.cabana_desc}` : ''}
            </span>
          </div>
          <div className="line">
            <span className="label">Date</span>
            <span className="val">{longDate(booking.booking_date)}</span>
          </div>
          <div className="line">
            <span className="label">Time</span>
            <span className="val">{blockRange(booking.start_time, booking.end_time)}</span>
          </div>
          <div className="line">
            <span className="label">Guests</span>
            <span className="val">{booking.guests}</span>
          </div>
          <div className="line">
            <span className="label">{confirmed ? 'Total paid' : 'Total due'}</span>
            <span className="val">{money(booking.total_cents)}</span>
          </div>
        </div>

        <p className="footnote">
          {business.name}
          <br />
          {business.address_line1}
          <br />
          {business.city}, {business.state}
          {business.phone ? <><br />{business.phone}</> : null}
        </p>

        {confirmed && (
          <p className="footnote">
            A confirmation has been sent to your email and mobile phone. Reservations are
            non-refundable. To ask about rescheduling, contact the venue.
          </p>
        )}
      </div>
    </main>
  );
}
