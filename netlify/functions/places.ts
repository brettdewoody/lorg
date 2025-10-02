import type { Handler } from '@netlify/functions'
import { requireSession } from '@shared/auth'
import { withPg } from '@shared/db'

type PlaceRow = {
  place_type: string
  name: string
  country_code: string
  admin1_code: string | null
  visited_at: string
}

type SummaryRow = {
  place_type: string
  total: number
}

export const handler: Handler = async (event) => {
  try {
    const { userId } = await requireSession(event)

    const [places, summaries] = await withPg(async (c) => {
      const detailPromise = c.query<PlaceRow>(
        `SELECT pb.place_type, pb.name, pb.country_code, pb.admin1_code, vp.visited_at
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
         ORDER BY vp.visited_at DESC
         LIMIT 50`,
        [userId]
      )

      const summaryPromise = c.query<SummaryRow>(
        `SELECT pb.place_type, COUNT(*) AS total
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
         GROUP BY pb.place_type`,
        [userId]
      )

      const [detail, summary] = await Promise.all([detailPromise, summaryPromise])
      return [detail.rows, summary.rows]
    })

    const counts = summaries.reduce<Record<string, number>>((acc, row) => {
      acc[row.place_type] = Number(row.total)
      return acc
    }, {})

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ places, counts }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error'
    return { statusCode: 500, body: message }
  }
}
