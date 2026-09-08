import { NextResponse } from 'next/server';
import { expireAbandonedCheckouts } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await expireAbandonedCheckouts());
}
