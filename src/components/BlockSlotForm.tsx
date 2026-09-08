'use client';

import { useActionState } from 'react';
import { blockSlotAction, type ActionResult } from '@/app/admin/actions';
import { blockRange } from '@/lib/format';

interface Props {
  cabanas: { id: string; name: string; description: string | null; max_guests?: number }[];
  blocks: { id: string; name: string; start_time: string; end_time: string }[];
  defaultDate: string;
  today: string;
}

export default function BlockSlotForm({ cabanas, blocks, defaultDate, today }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(blockSlotAction, null);

  return (
    <form className="panel" action={action}>
      {state && (state.ok ? <div className="notice">{state.message}</div> : <div className="error">{state.error}</div>)}
      <div className="row">
        <div className="field">
          <label htmlFor="block_date">Date</label>
          <input id="block_date" name="booking_date" type="date" defaultValue={defaultDate} min={today} />
        </div>
        <div className="field">
          <label htmlFor="block_cabana">Cabana</label>
          <select id="block_cabana" name="cabana_id">
            {cabanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="block_block">Time</label>
        <select id="block_block" name="block_id">
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {blockRange(b.start_time, b.end_time)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="block_reason">Reason</label>
        <input id="block_reason" name="reason" placeholder="Private event" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Blocking...' : 'Block this slot'}
      </button>
    </form>
  );
}
