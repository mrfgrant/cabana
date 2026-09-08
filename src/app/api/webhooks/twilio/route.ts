import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Twilio signs the full URL plus the POST body, sorted by key, with the auth token.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function verify(url: string, params: Record<string, string>, signature: string): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const url = `${site}/api/webhooks/twilio`;

  if (!signature || !verify(url, params, signature)) {
    console.error('twilio callback rejected: bad signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  const errorCode = params.ErrorCode ?? null;

  if (!sid || !status) return NextResponse.json({ received: true });

  const delivered = status === 'delivered';
  const failed = status === 'undelivered' || status === 'failed';

  await sql`
    update cabana.notifications
       set delivery_status = ${status},
           delivered_at = ${delivered ? new Date() : null},
           error_message = ${errorCode ? `Twilio error ${errorCode}` : null},
           status = ${failed ? 'FAILED' : 'SENT'}::cabana.notification_status
     where provider_id = ${sid}
  `;

  return NextResponse.json({ received: true });
}
