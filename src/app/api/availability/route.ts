import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/availability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A date in YYYY-MM-DD format is required.' }, { status: 400 });
  }
  const cabanas = await getAvailability(date);
  return NextResponse.json({ date, cabanas });
}
