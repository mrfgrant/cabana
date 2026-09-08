import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Resend signs with Svix: HMAC-SHA256 over "id.timestamp.body", key is the
 * base64 portion after "whsec_". Header may hold several space separated
 * versions, each "v1,<sig>".
 */
function verify(id: string, timestamp: string, body: string, header: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  // Reject anything older than five minutes to blunt replays.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  return header
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean)
    .some((sig) => {
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

export async function POST(req: Request) {
  const id = req.headers.get('svix-id') ?? '';
  const timestamp = req.headers.get('svix-timestamp') ?? '';
  const signature = req.headers.get('svix-signature') ?? '';
  const body = await req.text();

  if (!id || !timestamp || !signature || !verify(id, timestamp, body, signature)) {
    console.error('resend webhook rejected: bad signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Malformed' }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  const type = event.type ?? '';
  if (!emailId) return NextResponse.json({ received: true });

  const delivered = type === 'email.delivered';
  const failed =
    type === 'email.bounced' || type === 'email.complained' || type === 'email.delivery_delayed';

  await sql`
    update cabana.notifications
       set delivery_status = ${type.replace('email.', '')},
           delivered_at = ${delivered ? new Date() : null},
           status = ${failed ? 'FAILED' : 'SENT'}::cabana.notification_status,
           error_message = ${failed ? `Resend reported ${type}` : null}
     where provider_id = ${emailId}
  `;

  return NextResponse.json({ received: true });
}
