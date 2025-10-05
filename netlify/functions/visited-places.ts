import type { Handler } from '@netlify/functions'
import type { Geometry } from 'geojson'
import { requireSession } from '@shared/auth'
import { withPg } from '@shared/db'

type PlaceRow = {
  place_type: string
  name: string
  country_code: string
  admin1_code: string | null
  geom_json: string
}

const DEFAULT_TYPES = ['country', 'state', 'county', 'city', 'lake']
const MAX_PLACES = Number(process.env.VISITED_PLACE_LIMIT ?? 5000)

export const handler: Handler = async (event) => {
  try {
    const { userId } = await requireSession(event)

    const typesParam = event.queryStringParameters?.types
    const requestedTypes = typesParam
      ?.split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    const types = requestedTypes?.length ? requestedTypes : DEFAULT_TYPES

    const limitParam = Number(event.queryStringParameters?.limit ?? MAX_PLACES)
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_PLACES)
      : MAX_PLACES

    const { rows } = await withPg((c) =>
      c.query<PlaceRow>(
        `SELECT pb.place_type, pb.name, pb.country_code, pb.admin1_code, ST_AsGeoJSON(pb.geom) AS geom_json
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
           AND pb.place_type = ANY($2::text[])
         ORDER BY pb.place_type, pb.name
         LIMIT $3`,
        [userId, types, limit],
      ),
    )

    const parseGeometry = (json: string): Geometry | null => {
      const parsed = JSON.parse(json) as unknown
      if (!parsed || typeof parsed !== 'object') return null
      if (!('type' in parsed) || typeof (parsed as { type?: unknown }).type !== 'string')
        return null
      return parsed as Geometry
    }

    const features = rows.reduce<
      {
        type: 'Feature'
        properties: {
          place_type: string
          name: string
          country_code: string
          admin1_code: string | null
        }
        geometry: Geometry
      }[]
    >((acc, row) => {
      const geometry = parseGeometry(row.geom_json)
      if (!geometry) return acc
      acc.push({
        type: 'Feature',
        properties: {
          place_type: row.place_type,
          name: row.name,
          country_code: row.country_code,
          admin1_code: row.admin1_code,
        },
        geometry,
      })
      return acc
    }, [])

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'FeatureCollection', features }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error'
    console.error('visited-places error', err)
    return { statusCode: 500, body: message }
  }
}
