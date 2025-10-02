import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'

export const handler: Handler = async () => {
  try {
    const out = await withPg(async (c) => {
      const r = await c.query<{ host: string | null; port: number | null; now: string }>(
        `SELECT inet_server_addr()::text AS host, inet_server_port() AS port, now() AS now`
      )
      return r.rows[0] ?? null
    })
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, ...out }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
    return { statusCode: 500, body: `DB error: ${message}` }
  }
}
