import { requireManager } from '@/lib/auth';
import { activeCabanasAndBlocks } from '@/lib/manage';
import { getSettings } from '@/lib/settings';
import { todayInVenueTz } from '@/lib/format';
import ManualBookingForm from '@/components/ManualBookingForm';
import { AreaNote } from '@/components/Hint';

export const dynamic = 'force-dynamic';

export default async function NewBookingPage() {
  await requireManager();
  const [{ cabanas, blocks }, settings] = await Promise.all([
    activeCabanasAndBlocks(),
    getSettings(),
  ]);

  return (
    <>
      <h1>New booking</h1>
      <p className="sub">
        For reservations taken at the door or over the phone. No card is collected here. Record how
        the guest paid and collect it yourself.
      </p>
      <AreaNote title="door bookings">
        <p>
          For anyone booking in person or over the phone. This does not take a card. Run the payment
          on the POS, then record here what you charged and how.
        </p>
        <p>
          The cabana is held the instant you save, and the guest gets the same confirmation an
          online booking sends. If the slot was taken while you were typing, nothing is saved and
          you will be told.
        </p>
      </AreaNote>

      <ManualBookingForm
        cabanas={cabanas}
        blocks={blocks}
        today={todayInVenueTz()}
        totalCents={settings.pricing.total_cents}
        maxGuests={settings.booking.max_guests ?? 20}
      />
    </>
  );
}
