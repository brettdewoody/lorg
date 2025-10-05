import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'
import { requireSession } from '@shared/auth'
import type { Geometry } from 'geojson'

export const handler: Handler = async (event) => {
  try {
    const { userId } = await requireSession(event)
    const id = Number(event.queryStringParameters?.id)
    if (!id) return { statusCode: 400, body: 'Missing id' }

    const row = await withPg(async (c) => {
      const q = await c.query<{ full: Geometry | null; novel: Geometry | null }>(
        `SELECT
           COALESCE(ST_AsGeoJSON(masked_geom_s), ST_AsGeoJSON(masked_geom))::json AS full,
           COALESCE(ST_AsGeoJSON(novel_geom_s),  ST_AsGeoJSON(novel_geom))::json  AS novel
         FROM activity
         WHERE id=$1 AND user_id=$2`,
        [id, userId],
      )
      return q.rows[0] ?? null
    })

    if (!row) return { statusCode: 404, body: 'Not found' }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row),
    }
  } catch (err: unknown) {
    const statusCode =
      typeof err === 'object' && err && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode) || 500
        : 500
    const message =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message?: unknown }).message ?? 'Error')
        : 'Error'
    return { statusCode, body: message }
  }
}
