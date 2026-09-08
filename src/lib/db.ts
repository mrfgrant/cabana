import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

function connect(): Sql {
  if (global.__sql) return global.__sql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add it in Vercel under Project Settings > Environment Variables, ' +
        'or copy .env.example to .env.local for local development.',
    );
  }

  // prepare:false is required for Supabase's transaction pooler.
  const client = postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connection: { search_path: 'cabana, public' },
  });

  global.__sql = client;
  return client;
}

/**
 * Connects on first use rather than at import. A missing DATABASE_URL then
 * surfaces as a runtime error on the page that needed it, instead of
 * breaking the build.
 */
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    // Tagged template call: sql`select 1`
    return (connect() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const client = connect() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as Sql;
