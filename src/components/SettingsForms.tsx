'use client';

import { useActionState } from 'react';
import { saveSettingsAction, type ActionResult } from '@/app/admin/actions';
import { blockRange, money } from '@/lib/format';
import Hint, { AreaNote } from '@/components/Hint';

function Section({ title, section, children }: { title: string; section: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettingsAction, null);
  return (
    <form className="panel" action={action}>
      <input type="hidden" name="section" value={section} />
      <h3>{title}</h3>
      {state && (state.ok ? <div className="notice">{state.message}</div> : <div className="error">{state.error}</div>)}
      {children}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}

export default function SettingsForms({ settings, managers, cabanas, blocks }: any) {
  const { business, pricing, notifications, booking } = settings;

  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Nothing here requires a deploy. Changes take effect immediately.</p>

      <AreaNote title="settings">
        <p>
          Everything here is live the moment you save it, including prices guests see on the public
          page. Each section saves on its own.
        </p>
        <p>
          The one to be careful with is <strong>Delivery</strong>, at the bottom of Notifications.
          Leave it on Simulated while testing and no guest will ever be contacted.
        </p>
      </AreaNote>

      <Section title="Business" section="business">
        <div className="field">
          <label htmlFor="s_name">Name</label>
          <input id="s_name" name="name" defaultValue={business.name} />
        </div>
        <div className="field">
          <label htmlFor="s_addr">Street address</label>
          <input id="s_addr" name="address_line1" defaultValue={business.address_line1} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="s_city">City</label>
            <input id="s_city" name="city" defaultValue={business.city} />
          </div>
          <div className="field">
            <label htmlFor="s_state">State</label>
            <input id="s_state" name="state" defaultValue={business.state} />
          </div>
          <div className="field">
            <label htmlFor="s_zip">ZIP</label>
            <input id="s_zip" name="postal_code" defaultValue={business.postal_code} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="s_phone">Phone shown to guests</label>
            <input id="s_phone" name="phone" defaultValue={business.phone} placeholder="770-555-0100" />
          </div>
          <div className="field">
            <label htmlFor="s_email">Email shown to guests</label>
            <input id="s_email" name="email" defaultValue={business.email} placeholder="hello@1942onthesquare.com" />
          </div>
        </div>
      </Section>

      <Section title="Pricing" section="pricing">
        <div className="row">
          <div className="field">
            <label htmlFor="s_base">Base price</label>
            <input id="s_base" name="base_price" type="number" step="0.01" defaultValue={(pricing.base_price_cents / 100).toFixed(2)} />
          </div>
          <div className="field">
            <label htmlFor="s_tax">
              Sales tax
              <Hint label="Sales tax">
                Guests see one combined number, never this split. It is stored separately for your
                books, and it sets the ratio used when a manager charges a custom amount at the door.
              </Hint>
            </label>
            <input id="s_tax" name="tax" type="number" step="0.01" defaultValue={(pricing.tax_cents / 100).toFixed(2)} />
          </div>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          Guests currently see {money(pricing.total_cents)} as one number. The split is stored
          separately for your books.
        </p>
      </Section>

      <Section title="Booking rules" section="booking">
        <div className="row">
          <div className="field">
            <label htmlFor="s_hold">
              Checkout hold (minutes)
              <Hint label="Checkout hold">
                How long a cabana stays reserved while a guest is on the payment page. If they never
                finish, it goes back on sale automatically after this many minutes.
              </Hint>
            </label>
            <input id="s_hold" name="hold_minutes" type="number" min={1} defaultValue={booking.hold_minutes} />
          </div>
          <div className="field">
            <label htmlFor="s_guests">Max guests per cabana</label>
            <input id="s_guests" name="max_guests" type="number" min={1} defaultValue={booking.max_guests} />
          </div>
        </div>
      </Section>

      <Section title="Notifications" section="notifications">
        <label className="check">
          <input type="checkbox" name="customer_email" defaultChecked={notifications.customer_email} />
          <span>Email the guest</span>
        </label>
        <label className="check">
          <input type="checkbox" name="customer_sms" defaultChecked={notifications.customer_sms} />
          <span>Text the guest</span>
        </label>
        <label className="check">
          <input type="checkbox" name="manager_email" defaultChecked={notifications.manager_email} />
          <span>Email all active managers</span>
        </label>
        <label className="check">
          <input type="checkbox" name="manager_sms" defaultChecked={notifications.manager_sms} />
          <span>Text all active managers</span>
          <Hint label="Manager texts">
            Every active manager gets a text on every booking, with a link straight to that
            reservation. Turn this off if the volume becomes noisy and rely on email plus the daily
            report instead.
          </Hint>
        </label>
        <div className="row">
          <div className="field">
            <label htmlFor="s_report">
              Daily report time
              <Hint label="Daily report">
                Once a day every active manager gets the full day laid out: every cabana, every
                seating, who is booked, and the day's revenue.
              </Hint>
            </label>
            <input id="s_report" name="daily_report_time" type="time" defaultValue={notifications.daily_report_time} />
          </div>
          <div className="field">
            <label htmlFor="s_mode">
              Delivery
              <Hint label="Delivery">
                <strong>Simulated</strong> writes every message down exactly as it would be sent, but
                sends nothing. Use it to test safely. <strong>Live</strong> really emails and texts
                guests and managers. Switch back to Simulated any time you are experimenting.
              </Hint>
            </label>
            <select id="s_mode" name="mode" defaultValue={notifications.mode}>
              <option value="simulated">Simulated (recorded, not sent)</option>
              <option value="live">Live (Resend and Twilio)</option>
            </select>
          </div>
        </div>
      </Section>

      <h2>Managers</h2>
      <p className="sub">Everyone active here receives every booking notice and the daily report.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th></tr>
          </thead>
          <tbody>
            {managers.map((m: any) => (
              <tr key={m.email}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.phone}</td>
                <td>{m.role}</td>
                <td><span className={`tag ${m.active ? 'tag-confirmed' : ''}`}>{m.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Cabanas</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Where</th><th>Status</th></tr></thead>
          <tbody>
            {cabanas.map((c: any) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.description}</td>
                <td><span className={`tag ${c.active ? 'tag-confirmed' : ''}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Seatings</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>
            {blocks.map((b: any) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{blockRange(b.start_time, b.end_time)}</td>
                <td><span className={`tag ${b.active ? 'tag-confirmed' : ''}`}>{b.active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
