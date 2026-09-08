'use client';

import { useActionState, useState } from 'react';
import { cancelAction, type ActionResult } from '@/app/admin/actions';

export default function CancelForm({ bookingNumber }: { bookingNumber: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(cancelAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form className="panel" action={action}>
      <input type="hidden" name="booking_number" value={bookingNumber} />
      {state && (state.ok ? <div className="notice">{state.message}</div> : <div className="error">{state.error}</div>)}

      <div className="field">
        <label htmlFor="cx_reason">Reason</label>
        <input id="cx_reason" name="reason" placeholder="Guest could not attend" />
      </div>

      {confirming ? (
        <>
          <p style={{ fontSize: '0.88rem', marginTop: 0 }}>
            This releases the cabana and cannot be undone. The guest keeps no refund unless you
            issue one in Stripe yourself.
          </p>
          <button className="btn btn-danger" type="submit" disabled={pending}>
            {pending ? 'Cancelling...' : 'Yes, cancel this reservation'}
          </button>{' '}
          <button className="btn" type="button" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button className="btn btn-danger" type="button" onClick={() => setConfirming(true)}>
          Cancel reservation
        </button>
      )}
    </form>
  );
}
