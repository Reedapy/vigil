import { Pool } from 'pg'

// ─── Database Connection Pool ──────────────────────────────────────────────────
// A single shared Pool is reused across all route handlers.
// pg automatically handles connection checkout/return.

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // max concurrent connections
  idleTimeoutMillis: 30_000,  // close idle connections after 30s
  connectionTimeoutMillis: 5_000,
})

// Surface connection errors immediately rather than silently queuing
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err)
})

/**
 * query — thin wrapper that checks out a connection, runs the query,
 * and returns it. Use this for simple one-shot queries.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query(sql, params)
  return rows as T[]
}
