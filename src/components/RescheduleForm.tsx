'use client';

import { useActionState } from 'react';
import { rescheduleAction, type ActionResult } from '@/app/admin/actions';
import { blockRange } from '@/lib/format';

interface Props {
  bookingNumber: string;
  cabanas: { id: string; name: string }[];
  blocks: { id: string; name: string; start_time: string; end_time: string }[];
  current: { cabana_id: string; block_id: string; booking_date: string };
  today: string;
}

export default function RescheduleForm({ bookingNumber, cabanas, blocks, current, today }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(rescheduleAction, null);

  return (
    <form className="panel" action={action}>
      <input type="hidden" name="booking_number" value={bookingNumber} />
      {state && (state.ok ? <div className="notice">{state.message}</div> : <div className="error">{state.error}</div>)}

      <div className="row">
        <div className="field">
          <label htmlFor="rs_date">New date</label>
          <input id="rs_date" name="booking_date" type="date" defaultValue={current.booking_date} min={today} />
        </div>
        <div className="field">
          <label htmlFor="rs_cabana">New cabana</label>
          <select id="rs_cabana" name="cabana_id" defaultValue={current.cabana_id}>
            {cabanas.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="rs_block">New time</label>
        <select id="rs_block" name="block_id" defaultValue={current.block_id}>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>{blockRange(b.start_time, b.end_time)}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="rs_reason">Reason</label>
        <input id="rs_reason" name="reason" placeholder="Guest requested a different night" />
      </div>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Moving...' : 'Move reservation'}
      </button>
    </form>
  );
}
