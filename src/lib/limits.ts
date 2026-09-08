import { headers } from 'next/headers';
import { sql } from './db';

/** Best-effort client IP. Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Same thing for server actions, which have no Request object. */
export async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/**
 * True when the caller is still within budget. Counting lives in Postgres
 * so it survives serverless cold starts, which an in-memory counter would not.
 * Never throws: the limiter must not be able to take the site down.
 */
export async function allow(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const [row] = await sql<{ rate_limit: boolean }[]>`
      select cabana.rate_limit(${bucket}, ${limit}::int, ${windowSeconds}::int)
    `;
    return row.rate_limit;
  } catch (e) {
    console.error('rate limiter unavailable, allowing request', e);
    return true;
  }
}

/** How many cabanas this visitor is currently holding. */
export async function liveHoldsFor(ip: string): Promise<number> {
  try {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from cabana.booking_holds
      where client_ip = ${ip} and expires_at > now()
    `;
    return row.n;
  } catch {
    return 0;
  }
}
