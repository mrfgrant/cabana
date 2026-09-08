# 1942 On The Square — Cabana Reservations

Three cabanas, two fixed three-hour blocks a night, $189 total. Public booking through
Stripe, manager tools behind a login.

## Where things are

| Piece | Location |
| --- | --- |
| Database | Supabase project `district1921`, isolated `cabana` schema |
| Public booking | `src/app/page.tsx`, `src/components/BookingFlow.tsx` |
| Availability API | `src/app/api/availability` |
| Checkout | `src/app/api/checkout` |
| Stripe webhook | `src/app/api/stripe/webhook` |
| Notifications | `src/lib/notify.ts` |
| Hold expiry cron | `src/app/api/cron/expire-holds` |

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — Supabase → Project Settings → Database → Connection string →
     **Transaction pooler**. Paste the database password in place of `PASSWORD`.
   - `STRIPE_SECRET_KEY` — your `sk_test_...` key.
   - `STRIPE_WEBHOOK_SECRET` — from `stripe listen` or the dashboard endpoint.
   - `SESSION_SECRET`, `CRON_SECRET` — `openssl rand -base64 32`.
3. `npm run seed:managers` sets a starting password on all six demo managers.
4. `npm run dev`

### Testing the webhook locally

```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`, then book a cabana with card
`4242 4242 4242 4242`.

## How double-booking is prevented

Three layers, all server-side:

1. A partial unique index permits exactly one `CONFIRMED` booking per cabana + date +
   block. The database rejects a second one regardless of what the application does.
2. `cabana.acquire_hold()` takes a transaction-scoped advisory lock on the specific slot,
   then refuses if the slot is confirmed, blocked, or held by a different session.
   Concurrent requests serialize instead of racing.
3. The hold, customer record, and provisional booking are written in one transaction. If
   the slot is taken mid-flight, everything rolls back and no partial record survives.

The browser only renders what the database reports. It never decides availability.

## Webhook idempotency

`cabana.confirm_stripe_booking()` locks the booking row, returns it untouched if it is
already confirmed and paid, and only then applies the update. A replayed Stripe event
cannot create a second booking, and confirmation notices are sent only on the first
confirmation.

## Notifications

`NOTIFY_MODE=simulated` (the default) renders every email and SMS in full and records it
in `cabana.notifications` with status `SIMULATED` — nothing is sent, but you can read
exactly what would have gone out. Set `NOTIFY_MODE=live` and supply Resend and Twilio
credentials to send for real.

A notification failure is recorded and never rolls back a paid booking.

## Money

Stored in cents, three columns: `base_price_cents` 17500, `tax_cents` 1400,
`total_cents` 18900. Customers see one number. All three live in `cabana.settings`
under the `pricing` key, editable without a deploy.

## Manager area

Sign in at `/admin`. Middleware guards every admin route at the edge, so an unauthenticated
request never reaches a page that reads customer data.

| Page | What it does |
| --- | --- |
| Today | Tonight's six slots, revenue collected, upcoming reservations |
| Calendar | Day, week, and month views; block a cabana inline |
| Bookings | Search by name, phone, email, or booking number; filter by date and status |
| Booking detail | Full record, reschedule, cancel, reschedule and cancellation history, every message sent |
| Customers | Visit count, lifetime spend, full reservation history |
| Reports | Totals by cabana, seating, payment method, and night, with CSV export |
| Settings | Business info, pricing, hold length, notification toggles, daily report time |

Six manager logins, equal permissions. Deactivating a manager stops their notifications and
blocks their login while keeping every record they created.

## Scheduled jobs

`vercel.json` registers two crons:

- `/api/cron/expire-holds` every 5 minutes, releasing abandoned checkouts
- `/api/cron/daily-report` at 17:00 UTC, which is 12:00 PM Eastern

Both require `Authorization: Bearer $CRON_SECRET`. Vercel sends this automatically.

## Verified against the live database

| Test | Result |
| --- | --- |
| Second confirmed booking on a taken slot | Rejected by unique index |
| Hold attempt on a booked slot | Refused |
| Hold attempt on a blocked slot | Refused |
| Competing hold from a second shopper | Refused; original session keeps the slot |
| Same session re-entering checkout | Extends its own hold |
| Stripe webhook replayed three times | One booking, one confirmation, payment intent not overwritten |
| Reschedule | Moved cabana and date, payment preserved, history logged, old slot reopened |
| Cancellation | Status changed, inventory released, record and reason kept |

## Still to connect

Production Stripe keys, Resend, and Twilio. Flip `NOTIFY_MODE` to `live` in Settings once
those are in place.
