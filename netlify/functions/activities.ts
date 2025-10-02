import type { Handler } from '@netlify/functions'
import { getPool } from '@shared/db'
import { requireSession } from '@shared/auth'

export const handler: Handler = async (event) => {
  try {
    const { userId } = await requireSession(event)
    const pool = getPool()
    const client = await pool.connect()
    try {
      const limit = Math.min(Number(event.queryStringParameters?.limit || 25), 200)
      const offset = Math.max(Number(event.queryStringParameters?.offset || 0), 0)
      const fetchLimit = limit + 1
      const { rows } = await client.query(
        `SELECT id, strava_activity_id, sport_type, start_date,
                COALESCE(geom_len_m,0) AS total_m,
                COALESCE(new_len_m,0)  AS new_m,
                COALESCE(new_frac,0)   AS new_frac
         FROM activity
         WHERE user_id=$1
         ORDER BY start_date DESC
         LIMIT $2 OFFSET $3`,
        [userId, fetchLimit, offset]
      )
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const nextOffset = hasMore ? offset + limit : null
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, limit, offset, nextOffset, hasMore }),
      }
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    const statusCode = typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500
    const message = typeof err === 'object' && err && 'message' in err
      ? String((err as { message?: unknown }).message ?? 'Error')
      : 'Error'
    return { statusCode, body: message }
  }
}
