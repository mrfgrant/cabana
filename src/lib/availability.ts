import { sql } from './db';
import type { AvailabilityRow, CabanaAvailability } from './types';

/** Public-facing availability for one date. The database decides, not the browser. */
export async function getAvailability(date: string): Promise<CabanaAvailability[]> {
  await sql`select cabana.expire_holds()`;

  const rows = await sql<AvailabilityRow[]>`
    select * from cabana.availability(${date}::date)
  `;

  const byCabana = new Map<string, CabanaAvailability>();
  for (const r of rows) {
    if (!byCabana.has(r.cabana_id)) {
      byCabana.set(r.cabana_id, {
        id: r.cabana_id,
        name: r.cabana_name,
        description: r.cabana_desc,
        maxGuests: r.max_guests,
        blocks: [],
      });
    }
    byCabana.get(r.cabana_id)!.blocks.push({
      id: r.block_id,
      name: r.block_name,
      start_time: r.start_time,
      end_time: r.end_time,
      state: r.state,
    });
  }
  return [...byCabana.values()];
}

export class SlotUnavailableError extends Error {
  constructor(public reason: 'SLOT_BOOKED' | 'SLOT_BLOCKED' | 'SLOT_HELD' | 'TOO_MANY_HOLDS') {
    super(reason);
  }
}

export function toSlotError(err: unknown): SlotUnavailableError | null {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('TOO_MANY_HOLDS')) return new SlotUnavailableError('TOO_MANY_HOLDS');
  if (message.includes('SLOT_BOOKED')) return new SlotUnavailableError('SLOT_BOOKED');
  if (message.includes('SLOT_BLOCKED')) return new SlotUnavailableError('SLOT_BLOCKED');
  if (message.includes('SLOT_HELD')) return new SlotUnavailableError('SLOT_HELD');
  return null;
}

export const SLOT_MESSAGES: Record<string, string> = {
  SLOT_BOOKED: 'That cabana was just booked for this time. Pick another.',
  SLOT_BLOCKED: 'That cabana is unavailable for this time. Pick another.',
  SLOT_HELD: 'Someone is checking out for that cabana right now. Try again in a few minutes or pick another.',
  TOO_MANY_HOLDS: 'You already have reservations in checkout. Finish those first, or wait a few minutes.',
};
