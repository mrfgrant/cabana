import { requireManager } from '@/lib/auth';
import { sql } from '@/lib/db';
import ManagerAdmin from '@/components/ManagerAdmin';

export const dynamic = 'force-dynamic';

export default async function ManagersPage() {
  const me = await requireManager();

  const managers = await sql<any[]>`
    select id, name, email::text, phone, role, active,
           (password_hash is not null) as has_password
    from cabana.managers
    order by active desc, name
  `;

  return <ManagerAdmin managers={managers} meId={me.id} meName={me.name} />;
}
