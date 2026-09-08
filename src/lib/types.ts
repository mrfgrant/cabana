export type SlotState = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED';

export type BookingStatus =
  | 'AVAILABLE'
  | 'HELD'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'BLOCKED'
  | 'EXPIRED';

export type PaymentMethod = 'STRIPE' | 'TOAST' | 'CASH' | 'OTHER' | 'COMPLIMENTARY';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED';

export interface Business {
  name: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  email: string;
  timezone: string;
}

export interface Pricing {
  base_price_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
}

export interface Policy {
  text: string;
  sms_consent_text: string;
}

export interface AvailabilityRow {
  cabana_id: string;
  cabana_name: string;
  cabana_desc: string | null;
  max_guests: number;
  block_id: string;
  block_name: string;
  start_time: string;
  end_time: string;
  state: SlotState;
}

export interface CabanaAvailability {
  id: string;
  name: string;
  description: string | null;
  maxGuests: number;
  blocks: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    state: SlotState;
  }[];
}
