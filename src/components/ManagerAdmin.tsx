'use client';

import { useActionState, useState } from 'react';
import {
  saveManagerAction,
  deactivateManagerAction,
  changeMyPasswordAction,
  type ActionResult,
} from '@/app/admin/actions';
import Hint, { AreaNote } from '@/components/Hint';

interface Manager {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  active: boolean;
  has_password: boolean;
}

function ManagerForm({ manager, onDone }: { manager?: Manager; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveManagerAction,
    null,
  );
  const editing = Boolean(manager);

  return (
    <form className="panel" action={action}>
      {manager && <input type="hidden" name="manager_id" value={manager.id} />}
      <h3>{editing ? `Edit ${manager!.name}` : 'Add a manager'}</h3>

      {state &&
        (state.ok ? (
          <div className="notice">{state.message}</div>
        ) : (
          <div className="error">{state.error}</div>
        ))}

      <div className="field">
        <label htmlFor={`n_${manager?.id ?? 'new'}`}>Name</label>
        <input id={`n_${manager?.id ?? 'new'}`} name="name" defaultValue={manager?.name ?? ''} />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor={`e_${manager?.id ?? 'new'}`}>Email</label>
          <input
            id={`e_${manager?.id ?? 'new'}`}
            name="email"
            type="email"
            defaultValue={manager?.email ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor={`p_${manager?.id ?? 'new'}`}>
            Mobile
            <Hint label="Mobile">
              Where booking texts go. Type it however you like: it is saved in the format the text
              service requires.
            </Hint>
          </label>
          <input
            id={`p_${manager?.id ?? 'new'}`}
            name="phone"
            type="tel"
            placeholder="706-555-0134"
            defaultValue={manager?.phone ?? ''}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`pw_${manager?.id ?? 'new'}`}>
          {editing ? 'New password (leave blank to keep the current one)' : 'Password'}
        </label>
        <input
          id={`pw_${manager?.id ?? 'new'}`}
          name="password"
          type="password"
          autoComplete="new-password"
        />
      </div>

      <label className="check">
        <input type="checkbox" name="active" defaultChecked={manager?.active ?? true} />
        <span>Active: receives every booking notice and can sign in</span>
      </label>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Saving...' : editing ? 'Save changes' : 'Add manager'}
      </button>{' '}
      {onDone && (
        <button className="btn" type="button" onClick={onDone}>
          Done
        </button>
      )}
    </form>
  );
}

export default function ManagerAdmin({
  managers,
  meId,
  meName,
}: {
  managers: Manager[];
  meId: string;
  meName: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState<ActionResult | null, FormData>(
    changeMyPasswordAction,
    null,
  );

  const activeCount = managers.filter((m) => m.active).length;

  return (
    <>
      <h1>Managers</h1>
      <p className="sub">
        {activeCount} active. Everyone active receives every booking notice and the daily report.
      </p>

      <AreaNote title="managers">
        <p>
          Anyone marked active can sign in and receives every booking notice and the daily report,
          by both email and text.
        </p>
        <p>
          When someone leaves, <strong>deactivate</strong> them rather than deleting: their bookings
          and approvals stay attached to their name. The last active manager cannot be deactivated,
          so nobody can lock the whole team out.
        </p>
      </AreaNote>

      <div className="quick">
        <button className="btn btn-primary" type="button" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : 'Add a manager'}
        </button>
      </div>

      {adding && <ManagerForm onDone={() => setAdding(false)} />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {managers.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  {m.id === meId ? ' (you)' : ''}
                </td>
                <td>{m.email}</td>
                <td>{m.phone}</td>
                <td>
                  <span className={`tag ${m.active ? 'tag-confirmed' : ''}`}>
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                  {!m.has_password && <span className="tag tag-failed">No password</span>}
                </td>
                <td>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => setEditing(editing === m.id ? null : m.id)}
                  >
                    {editing === m.id ? 'Close' : 'Edit'}
                  </button>{' '}
                  {m.active && activeCount > 1 && (
                    <form action={deactivateManagerAction} style={{ display: 'inline' }}>
                      <input type="hidden" name="manager_id" value={m.id} />
                      <button className="btn btn-sm btn-danger" type="submit">
                        Deactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {managers
        .filter((m) => m.id === editing)
        .map((m) => (
          <ManagerForm key={m.id} manager={m} onDone={() => setEditing(null)} />
        ))}

      <h2>Your password</h2>
      <p className="sub">Signed in as {meName}.</p>
      <form className="panel" action={pwAction}>
        {pwState &&
          (pwState.ok ? (
            <div className="notice">{pwState.message}</div>
          ) : (
            <div className="error">{pwState.error}</div>
          ))}
        <div className="field">
          <label htmlFor="cur_pw">Current password</label>
          <input id="cur_pw" name="current_password" type="password" autoComplete="current-password" />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="new_pw">New password</label>
            <input id="new_pw" name="new_password" type="password" autoComplete="new-password" />
          </div>
          <div className="field">
            <label htmlFor="conf_pw">Confirm</label>
            <input id="conf_pw" name="confirm_password" type="password" autoComplete="new-password" />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={pwPending}>
          {pwPending ? 'Changing...' : 'Change my password'}
        </button>
      </form>
    </>
  );
}
