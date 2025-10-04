import type { Handler } from '@netlify/functions'
import { requireSession } from '@shared/auth'
import { withPg } from '@shared/db'

type CellRow = { cell_x: number; cell_y: number }
const CELL_GRID_DEG = Number(process.env.CELL_GRID_DEG ?? process.env.CELL_SIZE_DEG ?? 0.0005)
const MAX_CELLS = Number(process.env.VISITED_CELL_LIMIT ?? 10000)

export const handler: Handler = async (event) => {
  try {
    if (!Number.isFinite(CELL_GRID_DEG) || CELL_GRID_DEG <= 0) {
      throw new Error('CELL_GRID_DEG not configured')
    }

    const { userId } = await requireSession(event)
    const limitParam = Number(event.queryStringParameters?.limit ?? MAX_CELLS)
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_CELLS)
      : MAX_CELLS

    const { rows } = await withPg((c) =>
      c.query<CellRow>(
        `SELECT cell_x, cell_y
         FROM visited_cell
         WHERE user_id = $1
         ORDER BY cell_y, cell_x
         LIMIT $2`,
        [userId, limit]
      )
    )

    const features = rows.map(({ cell_x: x, cell_y: y }) => {
      const minLon = x * CELL_GRID_DEG
      const minLat = y * CELL_GRID_DEG
      const maxLon = minLon + CELL_GRID_DEG
      const maxLat = minLat + CELL_GRID_DEG
      return {
        type: 'Feature',
        properties: { cell_x: x, cell_y: y },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat],
            ],
          ],
        },
      }
    })

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'FeatureCollection', features }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error'
    console.error('visited-cells error', err)
    return { statusCode: 500, body: message }
  }
}
