import { requireManager } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { sql } from '@/lib/db';
import SettingsForms from '@/components/SettingsForms';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireManager();
  const settings = await getSettings();

  const [managers, cabanas, blocks] = await Promise.all([
    sql<any[]>`select name, email::text, phone, role, active from cabana.managers order by name`,
    sql<any[]>`select name, description, active from cabana.cabanas order by sort_order`,
    sql<any[]>`select name, start_time::text, end_time::text, active from cabana.booking_blocks order by sort_order`,
  ]);

  return <SettingsForms settings={settings} managers={managers} cabanas={cabanas} blocks={blocks} />;
}
