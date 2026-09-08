// Sets a password for every manager that does not have one.
// Usage: node scripts/seed-managers.mjs [password]
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const password = process.argv[2] ?? 'cabana1942';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const hash = await bcrypt.hash(password, 10);
const updated = await sql`
  update cabana.managers set password_hash = ${hash}, updated_at = now()
  where password_hash is null
  returning name, email::text
`;

console.log(`Set password for ${updated.length} manager(s):`);
for (const m of updated) console.log(`  ${m.name}  ${m.email}`);
console.log(`\nPassword: ${password}`);
console.log('Change it in the admin area before going live.');

await sql.end();
