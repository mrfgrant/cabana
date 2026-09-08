'use client';

import { useActionState } from 'react';
import { manualBookingAction, type ActionResult } from '@/app/admin/actions';
import { blockRange, money } from '@/lib/format';
import Hint from '@/components/Hint';

interface Props {
  cabanas: { id: string; name: string; description: string | null; max_guests: number }[];
  blocks: { id: string; name: string; start_time: string; end_time: string }[];
  today: string;
  totalCents: number;
  maxGuests: number;
}

const METHODS = [
  ['TOAST', 'Toast'],
  ['CASH', 'Cash'],
  ['STRIPE', 'Stripe (collected separately)'],
  ['OTHER', 'Other'],
  ['COMPLIMENTARY', 'Complimentary (no charge)'],
];

export default function ManualBookingForm({ cabanas, blocks, today, totalCents, maxGuests }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(manualBookingAction, null);

  return (
    <form className="panel" action={action}>
      {state && !state.ok && <div className="error">{state.error}</div>}

      <div className="row">
        <div className="field">
          <label htmlFor="mb_first">First name</label>
          <input id="mb_first" name="first_name" />
        </div>
        <div className="field">
          <label htmlFor="mb_last">Last name</label>
          <input id="mb_last" name="last_name" />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="mb_phone">Mobile</label>
          <input id="mb_phone" name="phone" type="tel" placeholder="770-555-0134" />
        </div>
        <div className="field">
          <label htmlFor="mb_guests">Guests</label>
          <input
            id="mb_guests"
            name="guests"
            type="number"
            min={1}
            max={Math.max(...cabanas.map((c) => c.max_guests), 1)}
            defaultValue={2}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="mb_email">Email</label>
        <input id="mb_email" name="email" type="email" />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="mb_date">Date</label>
          <input id="mb_date" name="booking_date" type="date" defaultValue={today} min={today} />
        </div>
        <div className="field">
          <label htmlFor="mb_cabana">Cabana</label>
          <select id="mb_cabana" name="cabana_id">
            {cabanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.description ? ` - ${c.description}` : ''} (seats {c.max_guests})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="mb_block">Time</label>
        <select id="mb_block" name="block_id">
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>{blockRange(b.start_time, b.end_time)}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="mb_price">
            Amount charged
            <Hint label="Amount charged">
              Leave blank to charge the standard rate. Otherwise type what you actually agreed with
              the guest. Sales tax is worked out from this number automatically, so the books still
              balance.
            </Hint>
          </label>
          <input
            id="mb_price"
            name="price"
            type="number"
            step="0.01"
            min={0}
            placeholder={(totalCents / 100).toFixed(2)}
          />
        </div>
        <div className="field">
          <label htmlFor="mb_method">Payment method</label>
          <select id="mb_method" name="payment_method" defaultValue="TOAST">
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mb_status">
          Payment status
          <Hint label="Payment status">
            Pick <strong>Collected</strong> once the guest has actually paid on the POS. Choose{' '}
            <strong>Not yet collected</strong> to hold the cabana for someone paying on arrival:
            it still counts as booked, but stays out of your revenue totals until you change it.
          </Hint>
        </label>
          <select id="mb_status" name="payment_status" defaultValue="PAID">
            <option value="PAID">Collected</option>
            <option value="UNPAID">Not yet collected</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="mb_notes">Notes</label>
        <textarea id="mb_notes" name="notes" />
      </div>

      <p className="sub" style={{ marginBottom: '1rem' }}>
        Leave the amount blank to charge the standard {money(totalCents)}, or enter what you agreed
        at the door. Collect it on the POS: no card is taken here and no Stripe receipt is sent.
        Complimentary bookings record {money(0)} whatever you type. The guest and every active
        manager get the same confirmation an online booking sends.
      </p>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create booking'}
      </button>
    </form>
  );
}
