import Link from 'next/link';
import { requireManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  await requireManager();

  return (
    <>
      <h1>How this works</h1>
      <p className="sub">
        A short tour of the manager portal. Every screen also has a &quot;How this works&quot; note
        at the top, and the small ? marks explain individual fields.
      </p>

      <h2>The short version</h2>
      <div className="help-step">
        <p>
          Guests book and pay online. The moment a payment clears, the cabana is locked, the guest
          gets a confirmation by email and text, and every active manager gets the same notice with
          a link straight to that reservation. At noon each day you all get a report listing every
          cabana and every seating for the day. Nobody has to call anybody.
        </p>
      </div>

      <h2>Day to day</h2>

      <div className="help-step">
        <span className="k">Today</span>
        <h3>Start your shift here</h3>
        <p>
          Every cabana and seating for today, who is in it, and how many guests. Open means
          bookable. Checking out means someone is mid-payment right now and has about ten minutes
          before the cabana frees up on its own.
        </p>
      </div>

      <div className="help-step">
        <span className="k">Calendar</span>
        <h3>Look ahead, and close off dates</h3>
        <p>
          Day, week, or month. Use <strong>Block a cabana</strong> for a private event, a repair, or
          weather. A blocked slot disappears from the public site and cannot be bought. You cannot
          block a slot that is already sold: cancel or move that reservation first.
        </p>
      </div>

      <div className="help-step">
        <span className="k">New booking</span>
        <h3>Walk-ins and phone reservations</h3>
        <p>
          No card is taken here. Charge the guest on the POS, then record what you took. Leave{' '}
          <strong>Amount charged</strong> blank for the standard price, or type the amount you
          agreed. The guest and every manager get the same confirmation an online booking sends.
        </p>
      </div>

      <div className="help-step">
        <span className="k">Bookings</span>
        <h3>Find any reservation</h3>
        <p>
          Search by name, phone, email, or booking number. Open one to reschedule it, cancel it,
          read the guest&apos;s requests, and see every message the system sent about it.
        </p>
      </div>

      <h2>Money and messages</h2>

      <div className="help-step">
        <span className="k">Reports</span>
        <h3>What sold, and where</h3>
        <p>
          Revenue by cabana, by seating, by day, and by payment method, for any date range. This is
          how you find out that one cabana or one seating outsells the rest, which is the number you
          need before changing a price. Download CSV hands the same data to your bookkeeper.
        </p>
      </div>

      <div className="help-step">
        <span className="k">Messages</span>
        <h3>Two statuses, not one</h3>
        <p>
          On every booking, each message shows what we did and what actually happened.{' '}
          <strong>Sent</strong> means the phone carrier or mail provider accepted it.{' '}
          <strong>Delivered</strong> means it landed. <strong>Bounced</strong> or{' '}
          <strong>undelivered</strong> means it did not, and the reason is shown. Resend retries any
          single message.
        </p>
      </div>

      <h2>Setup</h2>

      <div className="help-step">
        <span className="k">Managers</span>
        <h3>Who gets notified, and who can sign in</h3>
        <p>
          Anyone marked active receives every booking notice and the daily report, and can sign in.
          Deactivate someone who leaves rather than deleting them, so their history stays intact.
          You can change your own password at the bottom of that page.
        </p>
      </div>

      <div className="help-step">
        <span className="k">Settings</span>
        <h3>Prices, policy, and delivery</h3>
        <p>
          Changes here take effect immediately, with no redeploy.{' '}
          <strong>Delivery</strong> is the one to be careful with: <em>Simulated</em> writes every
          message down without sending it, which is how you test. <em>Live</em> actually sends to
          guests and managers.
        </p>
      </div>

      <h2>Things worth knowing</h2>
      <div className="help-step">
        <p>
          <strong>Cancelling never refunds anyone.</strong> It releases the cabana and records who
          cancelled and why. Refund on the POS or in Stripe yourself, deliberately.
        </p>
        <p>
          <strong>Rescheduling does not charge again.</strong> The original payment moves with the
          reservation. If the new slot is taken, nothing changes at all.
        </p>
        <p>
          <strong>An unpaid checkout frees itself.</strong> If a guest abandons payment, the cabana
          is released automatically within a few minutes.
        </p>
      </div>

      <div className="quick" style={{ marginTop: '1.5rem' }}>
        <Link className="btn btn-primary" href="/admin">Back to today</Link>
      </div>
    </>
  );
}
