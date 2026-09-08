import BookingFlow from '@/components/BookingFlow';
import { getSettings } from '@/lib/settings';
import { todayInVenueTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const settings = await getSettings();
  const { business, pricing, policy, booking } = settings;

  return (
    <main>
      <header className="hero">
        <div className="sign">
          <div className="sign-mark" role="img" aria-label="1942 On The Square" />
        </div>
        <h1>Reserve a cabana</h1>
        <div className="address">
          {business.address_line1}, {business.city}, {business.state}
          {business.phone ? (
            <>
              <br />
              <a href={`tel:${business.phone.replace(/\D/g, '')}`}>{business.phone}</a>
            </>
          ) : null}
        </div>
      </header>

      <div className="shell">
        <section className="included">
          <h2>Every cabana includes</h2>
          <ul>
            <li>Three hours, private to your party</li>
            <li>A bottle of champagne with four flutes</li>
            <li>A dedicated server</li>
          </ul>
        </section>

        <BookingFlow
          today={todayInVenueTz()}
          pricing={pricing}
          policy={policy}
          maxGuests={booking.max_guests ?? 20}
        />
      </div>
    </main>
  );
}
