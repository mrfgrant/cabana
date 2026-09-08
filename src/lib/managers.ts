import bcrypt from 'bcryptjs';
import { sql } from './db';

export interface ManagerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  active: boolean;
  has_password: boolean;
  created_at: string;
}

export async function listManagers(): Promise<ManagerRow[]> {
  return sql<ManagerRow[]>`
    select id, name, email::text, phone, role, active,
           (password_hash is not null) as has_password, created_at
    from cabana.managers
    order by active desc, name
  `;
}

export async function createManager(input: {
  name: string;
  email: string;
  phone: string;
  role: string;
  password: string;
}) {
  const hash = await bcrypt.hash(input.password, 10);
  const [row] = await sql<{ id: string }[]>`
    insert into cabana.managers (name, email, phone, role, password_hash)
    values (${input.name}, ${input.email.toLowerCase()}, ${input.phone}, ${input.role}, ${hash})
    returning id
  `;
  return row.id;
}

export async function updateManager(
  id: string,
  input: { name: string; email: string; phone: string; role: string },
) {
  await sql`
    update cabana.managers
       set name = ${input.name}, email = ${input.email.toLowerCase()},
           phone = ${input.phone}, role = ${input.role}, updated_at = now()
     where id = ${id}
  `;
}

export async function setManagerActive(id: string, active: boolean) {
  await sql`update cabana.managers set active = ${active}, updated_at = now() where id = ${id}`;
}

export async function setManagerPassword(id: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await sql`
    update cabana.managers set password_hash = ${hash}, updated_at = now() where id = ${id}
  `;
}

export async function countActiveManagers(): Promise<number> {
  const [row] = await sql<{ n: string }[]>`
    select count(*)::text as n from cabana.managers where active
  `;
  return Number(row.n);
}

export async function verifyPassword(id: string, password: string): Promise<boolean> {
  const [m] = await sql<{ password_hash: string | null }[]>`
    select password_hash from cabana.managers where id = ${id}
  `;
  if (!m?.password_hash) return false;
  return bcrypt.compare(password, m.password_hash);
}
