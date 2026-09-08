'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { endSession, requireManager, startSession, verifyCredentials } from '@/lib/auth';
import { createManualBooking } from '@/lib/bookings';
import { blockSlot, cancelBooking, getBooking, rescheduleBooking, unblockSlot } from '@/lib/manage';
import { resendNotification, sendBookingNotifications } from '@/lib/notify';
import { SLOT_MESSAGES, toSlotError } from '@/lib/availability';
import { updateSetting, getSettings } from '@/lib/settings';
import type { PaymentMethod } from '@/lib/types';
import { allow, clientIpFromHeaders } from '@/lib/limits';
import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return fail('Enter your email and password.');

  // Slow down credential stuffing: 8 tries per IP and 5 per account, both per 15 min.
  const ip = await clientIpFromHeaders();
  const okIp = await allow(`login:ip:${ip}`, 8, 900);
  const okUser = await allow(`login:user:${email}`, 5, 900);
  if (!okIp || !okUser) {
    return fail('Too many sign-in attempts. Wait fifteen minutes and try again.');
  }

  const session = await verifyCredentials(email, password);
  if (!session) return fail('That email and password do not match an active manager account.');

  await startSession(session);
  redirect(String(formData.get('next') || '/admin'));
}

export async function logoutAction() {
  await endSession();
  redirect('/admin/login');
}

export async function manualBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const manager = await requireManager();

  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const guests = Number(get('guests'));
  const method = get('payment_method') as PaymentMethod;

  if (!get('first_name') || !get('last_name')) return fail('Enter the guest first and last name.');
  if (!/^\S+@\S+\.\S+$/.test(get('email'))) return fail('Enter a valid email address.');
  if (get('phone').replace(/\D/g, '').length < 10) return fail('Enter a valid mobile number.');
  if (!Number.isInteger(guests) || guests < 1) return fail('Enter a guest count.');
  const [cab] = await sql<{ name: string; max_guests: number }[]>`
    select name, max_guests from cabana.cabanas where id = ${get('cabana_id')} and active
  `;
  if (!cab) return fail('That cabana is not available.');
  if (guests > cab.max_guests) return fail(`${cab.name} seats up to ${cab.max_guests} guests.`);

  // Blank means charge the standard rate.
  const rawPrice = get('price');
  let priceCents: number | null = null;
  if (rawPrice) {
    const parsed = Number(rawPrice);
    if (!Number.isFinite(parsed) || parsed < 0) return fail('Enter a valid amount, or leave it blank for the standard rate.');
    priceCents = Math.round(parsed * 100);
  }
  if (!get('cabana_id') || !get('block_id') || !get('booking_date')) {
    return fail('Choose a date, cabana, and time block.');
  }

  let result;
  try {
    result = await createManualBooking(
      {
        cabana_id: get('cabana_id'),
        booking_date: get('booking_date'),
        block_id: get('block_id'),
      },
      {
        first_name: get('first_name'),
        last_name: get('last_name'),
        email: get('email').toLowerCase(),
        phone: get('phone'),
        guests,
        notes: get('notes') || null,
      },
      {
        method,
        status: get('payment_status') === 'PAID' ? 'PAID' : 'UNPAID',
        totalCentsOverride: priceCents,
      },
      manager.id,
    );
  } catch (err) {
    const slotErr = toSlotError(err);
    if (slotErr) return fail(SLOT_MESSAGES[slotErr.reason]);
    console.error(err);
    return fail('Could not create the booking.');
  }

  await sendBookingNotifications(result.bookingId, 'BOOKING_CONFIRMED');
  redirect(`/admin/bookings/${result.bookingNumber}`);
}

export async function rescheduleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const manager = await requireManager();
  const bookingNumber = String(formData.get('booking_number') ?? '');
  const booking = await getBooking(bookingNumber);
  if (!booking) return fail('Booking not found.');

  try {
    await rescheduleBooking(
      booking.id,
      {
        cabana_id: String(formData.get('cabana_id') ?? ''),
        booking_date: String(formData.get('booking_date') ?? ''),
        block_id: String(formData.get('block_id') ?? ''),
      },
      manager.id,
      String(formData.get('reason') ?? '').trim() || null,
    );
  } catch (err) {
    const slotErr = toSlotError(err);
    if (slotErr) return fail(SLOT_MESSAGES[slotErr.reason]);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('SAME_SLOT')) return fail('That is the same date, cabana, and time it already has.');
    if (msg.includes('NOT_CONFIRMED')) return fail('Only confirmed bookings can be rescheduled.');
    console.error(err);
    return fail('Could not reschedule this booking.');
  }

  await sendBookingNotifications(booking.id, 'BOOKING_RESCHEDULED');
  revalidatePath(`/admin/bookings/${bookingNumber}`);
  return { ok: true, message: 'Rescheduled. The guest has been notified and the original payment stands.' };
}

export async function cancelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const manager = await requireManager();
  const bookingNumber = String(formData.get('booking_number') ?? '');
  const booking = await getBooking(bookingNumber);
  if (!booking) return fail('Booking not found.');

  try {
    await cancelBooking(booking.id, manager.id, String(formData.get('reason') ?? '').trim() || null);
  } catch (err) {
    console.error(err);
    return fail('Could not cancel this booking.');
  }

  await sendBookingNotifications(booking.id, 'BOOKING_CANCELLED');
  revalidatePath(`/admin/bookings/${bookingNumber}`);
  return { ok: true, message: 'Cancelled. Inventory released. No refund was issued.' };
}

export async function blockSlotAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const manager = await requireManager();
  try {
    await blockSlot(
      {
        cabana_id: String(formData.get('cabana_id') ?? ''),
        booking_date: String(formData.get('booking_date') ?? ''),
        block_id: String(formData.get('block_id') ?? ''),
      },
      String(formData.get('reason') ?? '').trim() || null,
      manager.id,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('SLOT_BOOKED')) {
      return fail('That slot has a confirmed booking. Cancel or reschedule it first.');
    }
    console.error(err);
    return fail('Could not block that slot.');
  }
  revalidatePath('/admin/calendar');
  return { ok: true, message: 'Blocked. It now shows as unavailable to the public.' };
}

export async function unblockSlotAction(formData: FormData) {
  const manager = await requireManager();
  await unblockSlot(String(formData.get('blocked_id') ?? ''), manager.id);
  revalidatePath('/admin/calendar');
}

export async function resendNotificationAction(formData: FormData) {
  await requireManager();
  await resendNotification(String(formData.get('notification_id') ?? ''));
  revalidatePath(`/admin/bookings/${String(formData.get('booking_number') ?? '')}`);
}

export async function saveSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireManager();
  const settings = await getSettings();
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const section = get('section');

  try {
    if (section === 'business') {
      await updateSetting('business', {
        ...settings.business,
        name: get('name'),
        address_line1: get('address_line1'),
        city: get('city'),
        state: get('state'),
        postal_code: get('postal_code'),
        phone: get('phone'),
        email: get('email'),
      });
    }

    if (section === 'pricing') {
      const base = Math.round(Number(get('base_price')) * 100);
      const tax = Math.round(Number(get('tax')) * 100);
      if (!Number.isFinite(base) || !Number.isFinite(tax) || base < 0 || tax < 0) {
        return fail('Enter valid amounts.');
      }
      await updateSetting('pricing', {
        ...settings.pricing,
        base_price_cents: base,
        tax_cents: tax,
        total_cents: base + tax,
      });
    }

    if (section === 'notifications') {
      await updateSetting('notifications', {
        ...settings.notifications,
        customer_email: formData.get('customer_email') === 'on',
        customer_sms: formData.get('customer_sms') === 'on',
        manager_email: formData.get('manager_email') === 'on',
        manager_sms: formData.get('manager_sms') === 'on',
        daily_report_time: get('daily_report_time') || '12:00',
        mode: get('mode') === 'live' ? 'live' : 'simulated',
      });
    }

    if (section === 'booking') {
      await updateSetting('booking', {
        ...settings.booking,
        hold_minutes: Number(get('hold_minutes')) || 10,
        max_guests: Number(get('max_guests')) || 20,
      });
    }
  } catch (err) {
    console.error(err);
    return fail('Could not save those settings.');
  }

  revalidatePath('/admin/settings');
  return { ok: true, message: 'Saved.' };
}


/* ---------------------------------------------------------------- managers */

function validPassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export async function saveManagerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireManager();
  const get = (k: string) => String(formData.get(k) ?? '').trim();

  const id = get('manager_id');
  const name = get('name');
  const email = get('email').toLowerCase();
  const phone = get('phone');
  const password = get('password');
  const active = formData.get('active') === 'on';

  if (!name) return fail('Enter a name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 10) return fail('Enter a valid mobile number.');

  // Store E.164 so Twilio accepts it without guesswork.
  const digits = phone.replace(/\D/g, '');
  const e164Phone = phone.startsWith('+')
    ? phone
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;

  try {
    if (id) {
      if (password) {
        const bad = validPassword(password);
        if (bad) return fail(bad);
        const hash = await bcrypt.hash(password, 10);
        await sql`
          update cabana.managers
             set name = ${name}, email = ${email}, phone = ${e164Phone},
                 active = ${active}, password_hash = ${hash}, updated_at = now()
           where id = ${id}
        `;
      } else {
        await sql`
          update cabana.managers
             set name = ${name}, email = ${email}, phone = ${e164Phone},
                 active = ${active}, updated_at = now()
           where id = ${id}
        `;
      }
      await sql`
        insert into cabana.audit_log (manager_id, action, entity_type, entity_id, new_value)
        values (${me.id}, 'MANAGER_UPDATED', 'manager', ${id}, ${sql.json({ name, email, active })})
      `;
      return { ok: true, message: `Saved ${name}.` };
    }

    const bad = validPassword(password);
    if (bad) return fail(`New managers need a password. ${bad}`);
    const hash = await bcrypt.hash(password, 10);
    const [created] = await sql<{ id: string }[]>`
      insert into cabana.managers (name, email, phone, role, active, password_hash)
      values (${name}, ${email}, ${e164Phone}, 'manager', ${active}, ${hash})
      returning id
    `;
    await sql`
      insert into cabana.audit_log (manager_id, action, entity_type, entity_id, new_value)
      values (${me.id}, 'MANAGER_CREATED', 'manager', ${created.id}, ${sql.json({ name, email })})
    `;
    return { ok: true, message: `${name} can now sign in.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('managers_email_key')) return fail('That email already belongs to a manager.');
    console.error(err);
    return fail('Could not save that manager.');
  } finally {
    revalidatePath('/admin/managers');
    revalidatePath('/admin/settings');
  }
}

export async function deactivateManagerAction(formData: FormData) {
  const me = await requireManager();
  const id = String(formData.get('manager_id') ?? '');

  // Never lock everyone out.
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from cabana.managers where active and id <> ${id}
  `;
  if (n < 1) return;

  await sql`update cabana.managers set active = false, updated_at = now() where id = ${id}`;
  await sql`
    insert into cabana.audit_log (manager_id, action, entity_type, entity_id)
    values (${me.id}, 'MANAGER_DEACTIVATED', 'manager', ${id})
  `;
  revalidatePath('/admin/managers');
}

export async function changeMyPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireManager();
  const current = String(formData.get('current_password') ?? '');
  const next = String(formData.get('new_password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');

  if (next !== confirm) return fail('The new passwords do not match.');
  const bad = validPassword(next);
  if (bad) return fail(bad);

  const ok = await verifyCredentials(me.email, current);
  if (!ok) return fail('Your current password is not correct.');

  const hash = await bcrypt.hash(next, 10);
  await sql`
    update cabana.managers set password_hash = ${hash}, updated_at = now() where id = ${me.id}
  `;
  await sql`
    insert into cabana.audit_log (manager_id, action, entity_type, entity_id)
    values (${me.id}, 'PASSWORD_CHANGED', 'manager', ${me.id})
  `;
  return { ok: true, message: 'Password changed.' };
}
