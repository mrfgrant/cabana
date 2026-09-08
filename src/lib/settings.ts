import { sql } from './db';
import type { Business, Policy, Pricing } from './types';

export interface Settings {
  business: Business;
  pricing: Pricing;
  policy: Policy;
  booking: { hold_minutes: number; max_advance_days: number | null; max_guests: number };
  notifications: {
    customer_email: boolean;
    customer_sms: boolean;
    manager_email: boolean;
    manager_sms: boolean;
    daily_report_time: string;
    mode: 'simulated' | 'live';
  };
  payment: { stripe_mode: 'test' | 'live' };
}

export async function getSettings(): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`
    select key, value from cabana.settings
  `;
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const [row] = await sql<{ value: Settings[K] }[]>`
    select value from cabana.settings where key = ${key as string}
  `;
  return row.value;
}

export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await sql`
    insert into cabana.settings (key, value, updated_at)
    values (${key as string}, ${sql.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}
