import type { Handler } from '@netlify/functions'
import fs from 'node:fs'
import path from 'node:path'
import { withPg } from '@shared/db'
import { refreshToken } from '@shared/strava'
import polyline from '@mapbox/polyline'
import type { Geometry, LineString } from 'geojson'
import { buildAnnotationMessage, type AnnotationPlace } from './utils/annotation'

type StravaAthlete = {
  measurement_preference?: string
}

type StravaActivityDetail = {
  sport_type?: string
  type?: string
  trainer?: boolean
  manual?: boolean
  distance?: number
  start_date?: string
  start_date_local?: string
  map?: { polyline?: string; summary_polyline?: string }
  athlete?: StravaAthlete
}

type QueueBody = {
  userId?: string
  stravaActivityId?: number
  source?: string
}

const isGeometryLike = (value: unknown): value is Geometry => {
  if (!value || typeof value !== 'object') return false
  const geom = value as { type?: unknown }
  return typeof geom.type === 'string'
}

const ALLOW_SPORTS = new Set<string>([
  'Run',
  'TrailRun',
  'Walk',
  'Hike',
  'Ride',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'EMountainBikeRide',
])
const isVirtualSport = (value: string | null | undefined) =>
  typeof value === 'string' && value.toLowerCase().includes('virtual')
const MIN_DISTANCE_LIST_M = 200
const metersToDegrees = (m: number) => m / 111_320
const CELL_GRID_DEG = Number(process.env.CELL_GRID_DEG ?? process.env.CELL_SIZE_DEG ?? 0.0005)

const fixturesRoot = () =>
  process.env.STRAVA_FIXTURES ? path.resolve(process.env.STRAVA_FIXTURES) : null

function readFixtureJson<T>(filename: string): T | null {
  const root = fixturesRoot()
  if (!root) return null
  const full = path.join(root, filename)
  if (!fs.existsSync(full)) return null
  const contents = fs.readFileSync(full, 'utf8')
  return JSON.parse(contents) as T
}

const haversineMeters = (a: [number, number], b: [number, number]): number => {
  const R = 6371000
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
  return R * c
}

type CellAccumulator = {
  cellX: number
  cellY: number
  length: number
  segments: [[number, number], [number, number]][]
  isActive: boolean
  firstPassDone: boolean
}

const cellKey = (x: number, y: number) => `${x}|${y}`

const metersPerDegreeLat = 111_320

const lonMetersPerDegree = (lat: number) =>
  Math.max(Math.cos((lat * Math.PI) / 180), 0.0001) * metersPerDegreeLat

const distanceSquared = (a: [number, number], b: [number, number]) => {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

const perpendicularDistanceSquared = (
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number => {
  const segDx = end[0] - start[0]
  const segDy = end[1] - start[1]
  if (segDx === 0 && segDy === 0) return distanceSquared(point, start)
  const t =
    ((point[0] - start[0]) * segDx + (point[1] - start[1]) * segDy) /
    (segDx * segDx + segDy * segDy)
  const clampedT = Math.max(0, Math.min(1, t))
  const projX = start[0] + clampedT * segDx
  const projY = start[1] + clampedT * segDy
  return distanceSquared(point, [projX, projY])
}

const simplifyLineForGrid = (
  coords: [number, number][],
  toleranceM: number,
): [number, number][] => {
  if (!Number.isFinite(toleranceM) || toleranceM <= 0 || coords.length <= 2) return coords

  const [originLon, originLat] = coords[0]
  const lonFactor = lonMetersPerDegree(originLat)
  const latFactor = metersPerDegreeLat
  const projected = coords.map<[number, number]>(([lon, lat]) => [
    (lon - originLon) * lonFactor,
    (lat - originLat) * latFactor,
  ])

  const keep = new Array(coords.length).fill(false)
  keep[0] = true
  keep[coords.length - 1] = true
  const stack: [number, number][] = [[0, coords.length - 1]]
  const tolSq = toleranceM * toleranceM

  while (stack.length) {
    const [startIdx, endIdx] = stack.pop()!
    if (endIdx - startIdx <= 1) continue

    const startPoint = projected[startIdx]
    const endPoint = projected[endIdx]
    let maxDistSq = -1
    let maxIdx = -1

    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const distSq = perpendicularDistanceSquared(projected[i], startPoint, endPoint)
      if (distSq > maxDistSq) {
        maxDistSq = distSq
        maxIdx = i
      }
    }

    if (maxDistSq > tolSq && maxIdx > startIdx && maxIdx < endIdx) {
      keep[maxIdx] = true
      stack.push([startIdx, maxIdx])
      stack.push([maxIdx, endIdx])
    }
  }

  const simplified: [number, number][] = []
  for (let i = 0; i < coords.length; i += 1) {
    if (keep[i]) simplified.push(coords[i])
  }

  if (simplified.length === 1) {
    return [coords[0], coords[coords.length - 1]] as [number, number][]
  }
  return simplified.length >= 2 ? simplified : coords.slice(0, 2)
}

async function triggerAnnotation(baseUrl: string | null, activityId: string | number) {
  if (!baseUrl) return
  try {
    await fetch(`${baseUrl}/.netlify/functions/strava-annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId }),
    })
  } catch (err) {
    console.error('Failed to queue annotation update', err)
  }
}

async function getAccessTokenForUser(userId: string): Promise<string> {
  if (fixturesRoot()) return 'fixture-token'

  return withPg(async (c) => {
    const q = await c.query<{ access_token: string; refresh_token: string; exp: string }>(
      `SELECT access_token, refresh_token, EXTRACT(EPOCH FROM expires_at) AS exp
       FROM strava_token WHERE user_id=$1`,
      [userId],
    )
    if (!q.rowCount) throw new Error('No token for user')
    const record = q.rows[0]
    let access = record.access_token
    if (Number(record.exp) * 1000 < Date.now()) {
      const rt = await refreshToken(record.refresh_token)
      access = rt.access_token
      await c.query(
        `UPDATE strava_token
           SET access_token=$1, refresh_token=$2, expires_at=to_timestamp($3)
         WHERE user_id=$4`,
        [rt.access_token, rt.refresh_token, rt.expires_at, userId],
      )
    }
    return access
  })
}

async function fetchActivityDetail(accessToken: string, id: number): Promise<StravaActivityDetail> {
  const fixture =
    readFixtureJson<StravaActivityDetail>(`${id}-detail.json`) ??
    readFixtureJson<StravaActivityDetail>(`${id}-summary.json`)
  if (fixture) return fixture

  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!res.ok) throw new Error(`Failed to fetch activity detail (${res.status})`)
  return res.json() as Promise<StravaActivityDetail>
}

type StreamsResp = { latlng?: { data: [number, number][] } }

async function fetchActivityLine(accessToken: string, id: number): Promise<LineString | null> {
  const fixtureStreams = readFixtureJson<StreamsResp>(`${id}-streams.json`)
  if (fixtureStreams?.latlng?.data?.length) {
    const coords = fixtureStreams.latlng.data.map(
      ([lat, lon]: [number, number]) => [lon, lat] as [number, number],
    )
    if (coords.length >= 2) return { type: 'LineString', coordinates: coords }
  }

  if (fixturesRoot()) {
    const detail =
      readFixtureJson<StravaActivityDetail>(`${id}-detail.json`) ??
      readFixtureJson<StravaActivityDetail>(`${id}-summary.json`)
    const poly = detail?.map?.polyline ?? detail?.map?.summary_polyline
    if (!poly) return null
    const decoded = polyline.decode(poly)
    const coords = decoded.map(([lat, lon]) => [lon, lat] as [number, number])
    if (coords.length < 2) return null
    return { type: 'LineString', coordinates: coords }
  }

  const s = await fetch(
    `https://www.strava.com/api/v3/activities/${id}/streams?keys=latlng&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (s.ok) {
    const data = (await s.json()) as StreamsResp
    const coords = data.latlng?.data?.map(
      ([lat, lon]: [number, number]) => [lon, lat] as [number, number],
    )
    if (coords && coords.length >= 2) return { type: 'LineString', coordinates: coords }
  }
  const detail = await fetchActivityDetail(accessToken, id)
  const p: string | undefined = detail?.map?.polyline ?? detail?.map?.summary_polyline
  if (!p) return null
  const decoded = polyline.decode(p)
  const coords = decoded.map(([lat, lon]) => [lon, lat] as [number, number])
  if (coords.length < 2) return null
  return { type: 'LineString', coordinates: coords }
}

function shouldProcess(detail: StravaActivityDetail): { ok: boolean; reason?: string } {
  const sport = detail.sport_type ?? detail.type
  if (isVirtualSport(sport)) return { ok: false, reason: 'virtual activity' }
  if (isVirtualSport(detail.type)) return { ok: false, reason: 'virtual activity' }
  if (!sport || !ALLOW_SPORTS.has(sport))
    return { ok: false, reason: `sport ${sport ?? 'unknown'} not allowed` }
  if (detail.trainer) return { ok: false, reason: 'trainer/indoor' }
  if (detail.manual) return { ok: false, reason: 'manual activity' }
  if (typeof detail.distance === 'number' && detail.distance < MIN_DISTANCE_LIST_M) {
    return { ok: false, reason: `distance < ${MIN_DISTANCE_LIST_M}m` }
  }
  return { ok: true }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
    const parsedBody: QueueBody = event.body ? (JSON.parse(event.body) as QueueBody) : {}
    const userId = typeof parsedBody.userId === 'string' ? parsedBody.userId : ''
    const stravaActivityId = Number(parsedBody.stravaActivityId ?? NaN)
    if (!userId || !stravaActivityId)
      return { statusCode: 400, body: 'Missing userId or stravaActivityId' }

    const host = event.headers?.host ?? ''
    const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1')
    const scheme = isLocalHost ? 'http' : 'https'
    const baseUrl = host
      ? (process.env.URL ?? process.env.DEPLOY_URL ?? `${scheme}://${host}`)
      : null
    const isFixtureMode = Boolean(fixturesRoot())
    const source = typeof parsedBody.source === 'string' ? parsedBody.source : ''
    const shouldQueueAnnotation = !isFixtureMode && source === 'webhook'
    const shouldAnnotate = source === 'webhook' || source === 'fixture'

    const simplifyM = Number(process.env.SIMPLIFY_M ?? 4)
    const simplifyDeg = metersToDegrees(simplifyM)
    const gridSimplifyToleranceM = Number.isFinite(Number(process.env.GRID_SIMPLIFY_M))
      ? Number(process.env.GRID_SIMPLIFY_M)
      : Math.max(simplifyM, 0)
    const neighborRadiusRaw = Number(process.env.CELL_NEIGHBOR_RADIUS ?? 1)
    const neighborRadius = Number.isFinite(neighborRadiusRaw)
      ? Math.max(0, Math.floor(neighborRadiusRaw))
      : 1

    const accessToken = await getAccessTokenForUser(userId)
    const detail = await fetchActivityDetail(accessToken, stravaActivityId)
    const measurementPreferenceRaw = detail?.athlete?.measurement_preference
    const measurementPreference =
      typeof measurementPreferenceRaw === 'string' ? measurementPreferenceRaw.toLowerCase() : null

    const { ok, reason } = shouldProcess(detail)
    if (!ok) {
      await withPg((c) =>
        c.query(
          `INSERT INTO activity (user_id, strava_activity_id, sport_type, start_date, geom, geom_len_m, new_len_m, new_frac, processed_at)
           VALUES ($1,$2,$3,$4,NULL,0,0,0,now())
           ON CONFLICT (strava_activity_id) DO NOTHING`,
          [
            userId,
            stravaActivityId,
            detail.sport_type ?? detail.type ?? 'Unknown',
            detail.start_date_local ?? detail.start_date ?? new Date().toISOString(),
          ],
        ),
      )
      return { statusCode: 200, body: `Skip ${stravaActivityId}: ${reason}` }
    }

    const sportType = detail.sport_type ?? detail.type ?? 'Ride'
    const startDate = detail.start_date_local ?? detail.start_date ?? new Date().toISOString()

    const line = await fetchActivityLine(accessToken, stravaActivityId)
    if (!line) {
      await withPg((c) =>
        c.query(
          `INSERT INTO activity (user_id, strava_activity_id, sport_type, start_date, geom, geom_len_m, new_len_m, new_frac, processed_at)
           VALUES ($1,$2,$3,$4,NULL,0,0,0,now())
           ON CONFLICT (strava_activity_id) DO NOTHING`,
          [userId, stravaActivityId, sportType, startDate],
        ),
      )
      return { statusCode: 200, body: `Activity ${stravaActivityId}: no usable geometry` }
    }

    let annotationText: string | null = null
    let newVisitedPlaces: AnnotationPlace[] = []
    let activityRowId: string | null = null

    // Everything below is one transaction
    await withPg(async (c) => {
      await c.query('BEGIN')
      try {
        const lineGeoJSON = JSON.stringify(line)
        if (measurementPreference) {
          await c.query(`UPDATE app_user SET measurement_preference=$1 WHERE id=$2`, [
            measurementPreference,
            userId,
          ])
        }

        const ins = await c.query<{ id: string; geom_geojson: string | null }>(
          `
          INSERT INTO activity (
            user_id, strava_activity_id, sport_type, start_date,
            geom, geom_len_m, new_len_m, new_frac, annotation_text,
            annotation_generated_at, annotation_applied_at, annotation_attempts, processed_at
          )
          VALUES (
            $1, $2, $3, $4,
            ST_SetSRID(
              ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($5), $6),
              4326
            ),
            NULL,
            0,
            0,
            NULL,
            NULL,
            NULL,
            0,
            now()
          )
          ON CONFLICT (strava_activity_id) DO UPDATE
          SET sport_type = EXCLUDED.sport_type,
              start_date = EXCLUDED.start_date,
              geom = EXCLUDED.geom,
              processed_at = now()
          RETURNING id, ST_AsGeoJSON(geom) AS geom_geojson
          `,
          [userId, stravaActivityId, sportType, startDate, lineGeoJSON, simplifyDeg],
        )
        const activityId = ins.rows[0].id
        activityRowId = activityId
        const baseGeomGeoJSON = ins.rows[0].geom_geojson

        const maskedRes = await c.query<{ masked_geojson: string | null }>(
          `
          WITH base AS (
            SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom
          ),
          mask AS (
            SELECT ST_Union(ST_Buffer(center::geography, radius_m)::geometry) AS g
            FROM privacy_zone WHERE user_id=$1
          ),
          diff AS (
            SELECT ST_Multi(
                     ST_CollectionExtract(
                       CASE
                         WHEN (SELECT g FROM mask) IS NOT NULL
                         THEN ST_Difference((SELECT geom FROM base), (SELECT g FROM mask))
                         ELSE (SELECT geom FROM base)
                       END, 2
                     )
                   ) AS geom
          )
          SELECT ST_AsGeoJSON(geom) AS masked_geojson
          FROM diff
          `,
          [userId, baseGeomGeoJSON],
        )

        const maskedGeoJSONString = maskedRes.rows[0]?.masked_geojson ?? null

        if (!maskedGeoJSONString) {
          await c.query(
            `UPDATE activity
             SET geom_len_m = 0,
                 new_len_m = 0,
                 new_frac = 0,
                 masked_geom = NULL,
                 masked_geom_s = NULL,
                 novel_geom = NULL,
                 novel_geom_s = NULL,
                 novel_cell_count = 0
             WHERE id = $1`,
            [activityId],
          )
          await c.query('COMMIT')
          return
        }

        const maskedGeoRaw = JSON.parse(maskedGeoJSONString) as unknown
        const maskedGeo = isGeometryLike(maskedGeoRaw) ? maskedGeoRaw : null

        const cellMap = new Map<string, CellAccumulator>()
        let totalMeters = 0

        const snapTolerance = Math.max(
          Number(process.env.SNAP_GRID_DEG ?? CELL_GRID_DEG / 2),
          Number.EPSILON,
        )

        const snapCoord = (lon: number, lat: number) => {
          const snappedLon = Math.round(lon / snapTolerance) * snapTolerance
          const snappedLat = Math.round(lat / snapTolerance) * snapTolerance
          return [snappedLon, snappedLat] as [number, number]
        }

        const enqueueLine = (coords: [number, number][]) => {
          const simplified = simplifyLineForGrid(coords, gridSimplifyToleranceM)
          if (simplified.length < 2) return
          let prevPoint = snapCoord(simplified[0][0], simplified[0][1])
          let prevCellKey: string | null = null
          for (let i = 1; i < simplified.length; i += 1) {
            const rawCurr = simplified[i]
            const currPoint = snapCoord(rawCurr[0], rawCurr[1])
            if (prevPoint[0] === currPoint[0] && prevPoint[1] === currPoint[1]) {
              prevPoint = currPoint
              continue
            }
            const prev = [prevPoint[0], prevPoint[1]] as [number, number]
            const curr = [currPoint[0], currPoint[1]] as [number, number]
            const lonDelta = Math.abs(curr[0] - prev[0])
            const latDelta = Math.abs(curr[1] - prev[1])
            const denom = Math.max(CELL_GRID_DEG, Number.EPSILON)
            const steps = Math.max(1, Math.ceil(Math.max(lonDelta, latDelta) / denom))
            let segStart = prev
            for (let step = 1; step <= steps; step += 1) {
              const t = step / steps
              const segEnd = [
                prev[0] + (curr[0] - prev[0]) * t,
                prev[1] + (curr[1] - prev[1]) * t,
              ] as [number, number]
              const subSegmentMeters = haversineMeters(segStart, segEnd)
              if (Number.isFinite(subSegmentMeters) && subSegmentMeters > 0) {
                totalMeters += subSegmentMeters
                const midLon = (segStart[0] + segEnd[0]) / 2
                const midLat = (segStart[1] + segEnd[1]) / 2
                const cellX = Math.floor(midLon / CELL_GRID_DEG)
                const cellY = Math.floor(midLat / CELL_GRID_DEG)
                const key = cellKey(cellX, cellY)
                if (prevCellKey && prevCellKey !== key) {
                  const prevEntry = cellMap.get(prevCellKey)
                  if (prevEntry) {
                    prevEntry.isActive = false
                    if (!prevEntry.firstPassDone) prevEntry.firstPassDone = true
                  }
                }
                let entry = cellMap.get(key)
                if (!entry) {
                  entry = {
                    cellX,
                    cellY,
                    length: 0,
                    segments: [],
                    isActive: false,
                    firstPassDone: false,
                  }
                  cellMap.set(key, entry)
                }
                const isReentry = entry.firstPassDone && !entry.isActive
                if (!isReentry) {
                  entry.isActive = true
                  entry.length += subSegmentMeters
                  entry.segments.push([segStart, segEnd])
                }
                prevCellKey = key
              }
              segStart = segEnd
            }
            prevPoint = currPoint
          }
          if (prevCellKey) {
            const lastEntry = cellMap.get(prevCellKey)
            if (lastEntry) {
              lastEntry.isActive = false
              if (!lastEntry.firstPassDone) lastEntry.firstPassDone = true
            }
          }
        }

        const walkGeometry = (geom: Geometry | null | undefined): void => {
          if (!geom) return
          if (geom.type === 'LineString') {
            enqueueLine(geom.coordinates as [number, number][])
          } else if (geom.type === 'MultiLineString') {
            for (const lineCoords of geom.coordinates as [number, number][][]) {
              enqueueLine(lineCoords)
            }
          } else if (geom.type === 'GeometryCollection') {
            for (const g of geom.geometries ?? []) {
              walkGeometry(g)
            }
          }
        }

        walkGeometry(maskedGeo)

        const cellEntries = Array.from(cellMap.values())

        const newCellKeys = new Set<string>()

        if (cellEntries.length) {
          const offsets: number[] = []
          for (let i = -neighborRadius; i <= neighborRadius; i += 1) offsets.push(i)
          const chunkSize = 500
          for (let i = 0; i < cellEntries.length; i += chunkSize) {
            const chunk = cellEntries.slice(i, i + chunkSize)
            const values: (string | number)[] = []
            const placeholders: string[] = []
            chunk.forEach((cell) => {
              offsets.forEach((dx) => {
                offsets.forEach((dy) => {
                  const baseIndex = values.length
                  values.push(userId, cell.cellX + dx, cell.cellY + dy)
                  placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`)
                })
              })
            })
            const inserted = await c.query<{ cell_x: number; cell_y: number }>(
              `INSERT INTO visited_cell (user_id, cell_x, cell_y)
               VALUES ${placeholders.join(',')}
               ON CONFLICT (user_id, cell_x, cell_y) DO NOTHING
               RETURNING cell_x, cell_y`,
              values,
            )
            for (const row of inserted.rows) {
              newCellKeys.add(cellKey(row.cell_x, row.cell_y))
            }
          }
        }

        let novelMeters = 0
        const novelSegments: [[number, number], [number, number]][] = []

        for (const key of newCellKeys) {
          const entry = cellMap.get(key)
          if (!entry) continue
          novelMeters += entry.length
          novelSegments.push(...entry.segments)
        }

        const newFrac = totalMeters > 0 ? novelMeters / totalMeters : 0
        const novelCellCount = newCellKeys.size

        const novelGeoJSONString = novelSegments.length
          ? JSON.stringify({
              type: novelSegments.length === 1 ? 'LineString' : 'MultiLineString',
              coordinates: novelSegments.length === 1 ? novelSegments[0] : novelSegments,
            })
          : null

        const maskedGeoParam = maskedGeoJSONString ?? null
        const novelGeoParam = novelGeoJSONString ?? null

        if (maskedGeoParam) {
          await c.query(
            `UPDATE activity
             SET masked_geom   = ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($1)), 4326),
                 masked_geom_s = ST_SetSRID(ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($1), $2)), 4326)
             WHERE id = $3`,
            [maskedGeoParam, simplifyDeg, activityId],
          )
        } else {
          await c.query(
            `UPDATE activity
             SET masked_geom = NULL,
                 masked_geom_s = NULL
             WHERE id = $1`,
            [activityId],
          )
        }

        if (novelGeoParam) {
          await c.query(
            `UPDATE activity
             SET novel_geom   = ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($1)), 4326),
                 novel_geom_s = ST_SetSRID(ST_Multi(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($1), $2)), 4326)
             WHERE id = $3`,
            [novelGeoParam, simplifyDeg, activityId],
          )
        } else {
          await c.query(
            `UPDATE activity
             SET novel_geom = NULL,
                 novel_geom_s = NULL
             WHERE id = $1`,
            [activityId],
          )
        }

        if (maskedGeoJSONString) {
          const supportedCountries = ['US', 'CA', 'GB']
          const places = await c.query<{ id: number; place_type: string; name: string }>(
            `
            WITH activity_geom AS (
              SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
            )
            SELECT pb.id, pb.place_type, pb.name
            FROM place_boundary pb
            JOIN activity_geom ag ON
              pb.country_code = ANY($2::text[])
              AND pb.geom && ST_Envelope(ag.geom)
              AND ST_Intersects(pb.geom, ag.geom)
            `,
            [maskedGeoJSONString, supportedCountries],
          )

          if (places.rowCount) {
            const values: (string | number)[] = []
            const placeholders: string[] = []
            places.rows.forEach((row, idx) => {
              values.push(userId, row.id, activityId)
              placeholders.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`)
            })

            const inserted = await c.query<{ place_boundary_id: number }>(
              `INSERT INTO visited_place (user_id, place_boundary_id, first_activity_id)
               VALUES ${placeholders.join(',')}
               ON CONFLICT DO NOTHING
               RETURNING place_boundary_id`,
              values,
            )

            if (inserted.rowCount) {
              const insertedIds = new Set(inserted.rows.map((row) => row.place_boundary_id))
              const unlocked = places.rows.filter((row) => insertedIds.has(row.id))
              if (unlocked.length) {
                newVisitedPlaces = unlocked.map((row) => ({
                  name: row.name,
                  placeType: row.place_type,
                }))
              }
            }
          }

          if (typeof activityRowId === 'string' && places.rowCount) {
            const visitActivityId = activityRowId
            const visitValues: (string | number)[] = []
            const visitPlaceholders: string[] = []
            places.rows.forEach((row, idx) => {
              visitValues.push(userId, row.id, visitActivityId, startDate)
              visitPlaceholders.push(
                `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`,
              )
            })

            if (visitValues.length) {
              await c.query(
                `INSERT INTO place_visit (user_id, place_boundary_id, activity_id, visited_at)
                 VALUES ${visitPlaceholders.join(',')}
                 ON CONFLICT DO NOTHING`,
                visitValues,
              )
            }
          }
        }

        if (shouldAnnotate) {
          annotationText = buildAnnotationMessage({
            novelMeters,
            measurementPref: measurementPreference,
            places: newVisitedPlaces,
          })
        } else {
          annotationText = null
        }

        const annotationTextParam: string | null = annotationText ?? null

        await c.query(
          `
          UPDATE activity
          SET geom_len_m      = $1,
              new_len_m       = $2,
              new_frac        = $3,
              annotation_text = $4::text,
              annotation_generated_at = CASE
                WHEN $4::text IS NULL THEN NULL
                WHEN annotation_text = $4::text THEN annotation_generated_at
                ELSE now()
              END,
              annotation_applied_at   = CASE
                WHEN $4::text IS NULL THEN NULL
                WHEN annotation_text = $4::text THEN annotation_applied_at
                ELSE NULL
              END,
              annotation_attempts     = CASE
                WHEN $4::text IS NULL THEN 0
                WHEN annotation_text = $4::text THEN annotation_attempts
                ELSE 0
              END,
              novel_cell_count        = $5
          WHERE id = $6
          `,
          [totalMeters, novelMeters, newFrac, annotationTextParam, novelCellCount, activityId],
        )

        await c.query('COMMIT')
      } catch (err) {
        await c.query('ROLLBACK')
        throw err
      }
    })

    if (shouldQueueAnnotation && annotationText && baseUrl && activityRowId) {
      await triggerAnnotation(baseUrl, activityRowId)
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activityId: stravaActivityId }),
    }
  } catch (err: unknown) {
    const message =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message?: unknown }).message ?? 'Error')
        : 'Error'
    console.error('Process error', err)
    return { statusCode: 500, body: message }
  }
}
