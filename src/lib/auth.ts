import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { sql } from './db';

const COOKIE = 'mgr_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short. Generate one with: openssl rand -base64 32');
  }
  return new TextEncoder().encode(secret);
}

export interface Session {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function verifyCredentials(email: string, password: string): Promise<Session | null> {
  const [m] = await sql<
    { id: string; name: string; email: string; role: string; password_hash: string | null; active: boolean }[]
  >`
    select id, name, email::text, role, password_hash, active
    from cabana.managers
    where email = ${email.trim().toLowerCase()}
  `;
  // Constant-ish work whether or not the account exists.
  const hash = m?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(password, hash);
  if (!m || !m.active || !m.password_hash || !ok) return null;
  return { id: m.id, name: m.name, email: m.email, role: m.role };
}

export async function startSession(session: Session) {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/** Use in every admin page and action. Throws rather than returning bad data. */
export async function requireManager(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function setPassword(managerId: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await sql`
    update cabana.managers set password_hash = ${hash}, updated_at = now() where id = ${managerId}
  `;
}

export const SESSION_COOKIE = COOKIE;
