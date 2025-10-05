// src/shared/db.ts
import type { PoolConfig } from 'pg'
import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL not set')

  const poolConfig: PoolConfig & { maxUses?: number } = {
    connectionString,
    max: 2, // super small under Netlify dev
    maxUses: 100, // recycle sockets periodically
    idleTimeoutMillis: 10_000, // trim idles quickly
    connectionTimeoutMillis: 15_000, // tolerate brief PgBouncer pauses
    keepAlive: true,
    ssl: { rejectUnauthorized: false } as PoolConfig['ssl'],
  }

  const p = new Pool(poolConfig)

  // Any pool/socket error => rebuild pool next time
  p.on('error', (err: unknown) => {
    console.error('PG pool error (rebuilding):', err instanceof Error ? err.message : err)
    try {
      p.end().catch((endErr: unknown) => {
        console.warn('PG pool end error', endErr)
      })
    } finally {
      if (pool === p) pool = null
    }
  })

  return p
}

export function getPool(): Pool {
  if (!pool) pool = makePool()
  return pool
}

type PgErrorLike = { message?: unknown; code?: unknown }

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const value = (err as PgErrorLike).message
    if (value !== undefined) return String(value)
  }
  return ''
}

function extractCode(err: unknown): unknown {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as PgErrorLike).code
  }
  return undefined
}

function isTransient(err: unknown): boolean {
  const msg = extractMessage(err)
  const code = extractCode(err)
  return (
    msg.includes('Unable to check out process') || // PgBouncer checkout timeout
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('Client has encountered a connection error') ||
    msg.includes('socket hang up') ||
    msg.includes('read ECONNRESET') ||
    msg.includes('db_termination') ||
    msg.includes('{:shutdown') ||
    code === '57P01' /* admin_shutdown */ ||
    code === 'XX000' /* generic internal (PgBouncer often uses this) */
  )
}

/** One-time retry helper with tiny backoff if the socket/pool is flaky. */
export async function withPg<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  async function runOnce(): Promise<T> {
    const p = getPool()
    const c = await p.connect()
    try {
      await c.query(`SET statement_timeout='8s'; SET idle_in_transaction_session_timeout='8s';`)
      return await fn(c)
    } finally {
      try {
        c.release()
      } catch {
        /* ignore release error */
      }
    }
  }

  try {
    return await runOnce()
  } catch (err: unknown) {
    if (!isTransient(err)) throw err
    // rebuild pool + brief backoff + retry once
    try {
      if (pool) {
        await pool.end().catch((endErr: unknown) => {
          console.warn('PG pool end error', endErr)
        })
        pool = null
      }
    } catch {
      /* ignore pool teardown error */
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250))
    return await runOnce()
  }
}
