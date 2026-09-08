'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { loginAction, type ActionResult } from '../actions';

function LoginForm() {
  const next = useSearchParams().get('next') ?? '/admin';
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" />
      </div>
      {state && !state.ok && <div className="error">{state.error}</div>}
      <button className="pay" type="submit" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-shell">
      <div className="masthead" style={{ paddingTop: 0 }}>
        <span className="year">1942</span>
        <span className="place">Manager access</span>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
