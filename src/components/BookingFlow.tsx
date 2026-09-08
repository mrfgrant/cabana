'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, blockRange, longDate, money, shortDate } from '@/lib/format';
import type { CabanaAvailability } from '@/lib/types';

interface Props {
  today: string;
  pricing: { base_price_cents: number; tax_cents: number; total_cents: number };
  policy: { text: string; sms_consent_text: string };
  maxGuests: number;
}

interface Selection {
  cabanaId: string;
  cabanaName: string;
  blockId: string;
  label: string;
  maxGuests: number;
}

const STATE_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  BOOKED: 'Booked',
  BLOCKED: 'Unavailable',
  HELD: 'On hold',
};

export default function BookingFlow({ today, pricing, policy, maxGuests }: Props) {
  const [date, setDate] = useState(today);
  const [cabanas, setCabanas] = useState<CabanaAvailability[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    guests: '2', special_requests: '', notes: '',
    policy_accepted: false, sms_consent: false,
  });

  const loadAvailability = useCallback(async (forDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/availability?date=${forDate}`, { cache: 'no-store' });
      const data = await res.json();
      setCabanas(data.cabanas ?? []);
    } catch {
      setError('Could not load availability. Check your connection and try again.');
      setCabanas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelection(null);
    loadAvailability(date);
  }, [date, loadAvailability]);

  const chips = Array.from({ length: 10 }, (_, i) => addDays(today, i));

  function choose(cabana: CabanaAvailability, block: CabanaAvailability['blocks'][number]) {
    setSelection({
      cabanaId: cabana.id,
      cabanaName: cabana.name,
      blockId: block.id,
      label: blockRange(block.start_time, block.end_time),
      maxGuests: cabana.maxGuests,
    });
    // Never leave a guest count above what the chosen cabana seats.
    setForm((f) => ({
      ...f,
      guests: String(Math.min(Number(f.guests) || 1, cabana.maxGuests)),
    }));
    setError(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function pay() {
    if (!selection) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cabana_id: selection.cabanaId,
          block_id: selection.blockId,
          booking_date: date,
          ...form,
          guests: Number(form.guests),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start checkout.');
        if (res.status === 409) {
          setSelection(null);
          loadAvailability(date);
        }
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not reach the payment page. Try again.');
      setSubmitting(false);
    }
  }

  const ready =
    selection &&
    form.first_name.trim() &&
    form.last_name.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    form.phone.replace(/\D/g, '').length >= 10 &&
    Number(form.guests) >= 1 &&
    Number(form.guests) <= selection.maxGuests &&
    form.policy_accepted;

  return (
    <>
      <section className="step">
        <div className="step-head">
          <span className="n">1</span>
          <h2>Pick a day</h2>
        </div>
        <input
          className="date-field"
          type="date"
          value={date}
          min={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Reservation date"
        />
        <div className="date-chips">
          {chips.map((d) => (
            <button
              key={d}
              type="button"
              className="chip"
              aria-pressed={d === date}
              onClick={() => setDate(d)}
            >
              {d === today ? 'Today' : shortDate(d)}
            </button>
          ))}
        </div>
      </section>

      <section className="step">
        <div className="step-head">
          <span className="n">2</span>
          <h2>Choose your cabana</h2>
        </div>

        <div className="plan" aria-hidden="true">
          <span>Bar</span>
          <span className="rule" />
          <span>Street</span>
        </div>

        {loading && <p className="empty">Checking {longDate(date)}...</p>}

        {!loading && cabanas?.length === 0 && (
          <p className="empty">Nothing is open on {longDate(date)}. Try another day.</p>
        )}

        {!loading &&
          cabanas?.map((cabana) => (
            <div className="cabana" key={cabana.id}>
              <div className="cabana-head">
                <h3>{cabana.name}</h3>
                {cabana.description && <div className="where">{cabana.description}</div>}
                <div className="where">Seats up to {cabana.maxGuests}</div>
              </div>
              {cabana.blocks.map((block) => {
                const open = block.state === 'AVAILABLE';
                const picked =
                  selection?.cabanaId === cabana.id && selection?.blockId === block.id;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className="slot"
                    disabled={!open}
                    aria-pressed={picked}
                    onClick={() => choose(cabana, block)}
                  >
                    <span>
                      <span className="time">{blockRange(block.start_time, block.end_time)}</span>
                      <br />
                      <span className="price">{money(pricing.total_cents)}</span>
                    </span>
                    <span className="state">{STATE_LABEL[block.state]}</span>
                  </button>
                );
              })}
            </div>
          ))}
      </section>

      <div ref={formRef} />

      {selection && (
        <section className="step">
          <div className="step-head">
            <span className="n">3</span>
            <h2>Your details</h2>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="first_name">First name</label>
              <input
                id="first_name"
                autoComplete="given-name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="last_name">Last name</label>
              <input
                id="last_name"
                autoComplete="family-name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="770-555-0134"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="guests">Number of guests (up to {selection.maxGuests})</label>
            <input
              id="guests"
              type="number"
              inputMode="numeric"
              min={1}
              max={selection.maxGuests}
              value={form.guests}
              onChange={(e) => setForm({ ...form, guests: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="special_requests">Anything we should know? (optional)</label>
            <textarea
              id="special_requests"
              value={form.special_requests}
              onChange={(e) => setForm({ ...form, special_requests: e.target.value })}
            />
          </div>

          <div className="policy"><strong>Before you book</strong>{policy.text}</div>

          <label className="check">
            <input
              type="checkbox"
              checked={form.policy_accepted}
              onChange={(e) => setForm({ ...form, policy_accepted: e.target.checked })}
            />
            <span>I understand this reservation is non-refundable.</span>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={form.sms_consent}
              onChange={(e) => setForm({ ...form, sms_consent: e.target.checked })}
            />
            <span>{policy.sms_consent_text}</span>
          </label>

          <div className="summary">
            <div className="line">
              <span className="label">Cabana</span>
              <span>{selection.cabanaName}</span>
            </div>
            <div className="line">
              <span className="label">Date</span>
              <span>{longDate(date)}</span>
            </div>
            <div className="line">
              <span className="label">Time</span>
              <span>{selection.label}</span>
            </div>
            <div className="line total">
              <span>Total</span>
              <span>{money(pricing.total_cents)}</span>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <button className="pay" disabled={!ready || submitting} onClick={pay}>
            {submitting ? 'Opening checkout...' : `Pay ${money(pricing.total_cents)}`}
          </button>
        </section>
      )}

      {!selection && error && <div className="error">{error}</div>}
    </>
  );
}
