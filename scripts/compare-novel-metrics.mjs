import fs from 'node:fs'
import path from 'node:path'
import polyline from '@mapbox/polyline'
import { Pool } from 'pg'

function encode(value) {
  return encodeURIComponent(value ?? '')
}

function readServiceConnection(serviceName) {
  const serviceFile = process.env.PGSERVICEFILE || path.resolve('.pg_service.conf')
  if (!fs.existsSync(serviceFile)) return null

  const text = fs.readFileSync(serviceFile, 'utf8')
  const lines = text.split(/\r?\n/)
  let current = null
  const services = new Map()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      current = line.slice(1, -1)
      if (!services.has(current)) services.set(current, {})
      continue
    }
    if (!current) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    services.get(current)[key] = value
  }

  const svc = services.get(serviceName)
  if (!svc) return null
  const { host, port, user, password, dbname, sslmode } = svc
  if (!host || !user || !password || !dbname) return null

  let url = `postgresql://${encode(user)}:${encode(password)}@${host}`
  if (port) url += `:${port}`
  url += `/${dbname}`
  if (sslmode) url += `?sslmode=${encodeURIComponent(sslmode)}`
  return url
}

const args = process.argv.slice(2)
const positional = []
const flags = new Set()

for (const arg of args) {
  if (arg.startsWith('--')) flags.add(arg)
  else positional.push(arg)
}

const fixturesDir = positional[0] ? path.resolve(positional[0]) : path.resolve('fixtures/strava')
const cellGrid = Number(process.env.CELL_GRID || 0.0005)

const explicitNoDb = flags.has('--no-db')
const explicitWithDb = flags.has('--with-db')

const defaultDbUrl =
  process.env.DATABASE_URL || process.env.DEV_DATABASE_URL || readServiceConnection('lorg-dev')

const wantsDb = explicitNoDb ? false : explicitWithDb || Boolean(defaultDbUrl)

if (!fs.existsSync(fixturesDir)) {
  console.error(`Fixtures directory not found: ${fixturesDir}`)
  process.exit(1)
}

const visitedCells = new Set()

let totalKm = 0
let newCellKm = 0

function snap(value, grid) {
  return Math.round(value / grid) * grid
}

function cellKey(lon, lat) {
  const cx = Math.floor(lon / cellGrid)
  const cy = Math.floor(lat / cellGrid)
  return `${cx}|${cy}`
}

function haversine(a, b) {
  const R = 6371000
  const toRad = (v) => (v * Math.PI) / 180
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

function loadJson(filename) {
  const full = path.join(fixturesDir, filename)
  if (!fs.existsSync(full)) return null
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

function getCoords(id) {
  const streams = loadJson(`${id}-streams.json`)
  if (streams?.latlng?.data?.length) {
    return streams.latlng.data.map(([lat, lon]) => [lon, lat])
  }
  const detail = loadJson(`${id}-detail.json`)
  const poly = detail?.map?.polyline || detail?.map?.summary_polyline
  if (poly) {
    return polyline.decode(poly).map(([lat, lon]) => [lon, lat])
  }
  const summary = loadJson(`${id}-summary.json`)
  const sumPoly = summary?.map?.summary_polyline
  if (sumPoly) {
    return polyline.decode(sumPoly).map(([lat, lon]) => [lon, lat])
  }
  return []
}

async function fetchDbDetails(pool, activityId) {
  const { rows } = await pool.query(
    `
    SELECT a.annotation_text,
           COALESCE(
             json_agg(
               json_build_object(
                 'name', pb.name,
                 'place_type', pb.place_type,
                 'country_code', pb.country_code
               )
               ORDER BY pb.place_type, pb.name
             ) FILTER (WHERE pb.id IS NOT NULL),
             '[]'::json
           ) AS places
    FROM activity a
    LEFT JOIN visited_place vp ON vp.first_activity_id = a.id
    LEFT JOIN place_boundary pb ON pb.id = vp.place_boundary_id
    WHERE a.strava_activity_id = $1
    GROUP BY a.id
    `,
    [activityId]
  )

  if (rows.length === 0) return null
  const row = rows[0]
  const rawPlaces = row.places
  let places = []
  if (Array.isArray(rawPlaces)) {
    places = rawPlaces
  } else if (typeof rawPlaces === 'string') {
    try {
      places = JSON.parse(rawPlaces)
    } catch {
      places = []
    }
  }

  return {
    annotation: row.annotation_text ?? null,
    places,
  }
}

async function main() {
  let pool = null
  let dbDisabled = false

  if (wantsDb) {
    const connectionString = defaultDbUrl
    if (!connectionString) {
      console.warn('No database URL available; skipping DB annotations output')
    } else {
      if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED && /supabase\.com/.test(connectionString)) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      }
      pool = new Pool({
        connectionString,
        max: 2,
        idleTimeoutMillis: 10_000,
        ssl: { rejectUnauthorized: false },
      })
    }
  }

  const summaries = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith('-summary.json'))
    .map((file) => {
      const id = Number(file.replace('-summary.json', ''))
      const summary = loadJson(file)
      const date = summary?.start_date_local || summary?.start_date || null
      const sport = summary?.sport_type || summary?.type || ''
      const trainer = Boolean(summary?.trainer)
      const manual = Boolean(summary?.manual)
      return { id, date, sport, trainer, manual }
    })
    .filter((item) => Number.isFinite(item.id))
    .filter((item) => {
      if (item.trainer) {
        console.log(`Skipping ${item.id} (trainer activity)`)
        return false
      }
      if (item.manual) {
        console.log(`Skipping ${item.id} (manual activity)`)
        return false
      }
      const sportNorm = item.sport?.toLowerCase() || ''
      if (sportNorm.includes('virtual')) {
        console.log(`Skipping ${item.id} (virtual activity: ${item.sport})`)
        return false
      }
      return true
    })
    .sort((a, b) => {
      const aTime = a.date ? Date.parse(a.date) : 0
      const bTime = b.date ? Date.parse(b.date) : 0
      return aTime - bTime
    })

  console.log(`Found ${summaries.length} activities in ${fixturesDir}`)

  for (const { id, date } of summaries) {
    const coords = getCoords(id)
    if (coords.length < 2) {
      console.warn(`Skipping ${id} (no coordinates)`)
      continue
    }

    let activityTotal = 0
    const cellAccum = new Map()

    for (let i = 1; i < coords.length; i += 1) {
      const prev = coords[i - 1]
      const curr = coords[i]
      if (prev[0] === curr[0] && prev[1] === curr[1]) continue

      const segmentLength = haversine(prev, curr) / 1000
      activityTotal += segmentLength

      const midLon = (prev[0] + curr[0]) / 2
      const midLat = (prev[1] + curr[1]) / 2
      const cellKeyVal = cellKey(midLon, midLat)
      cellAccum.set(cellKeyVal, (cellAccum.get(cellKeyVal) ?? 0) + segmentLength)
    }

    let novelCell = 0
    for (const [key, length] of cellAccum.entries()) {
      if (!visitedCells.has(key)) {
        visitedCells.add(key)
        novelCell += length
      }
    }

    totalKm += activityTotal
    newCellKm += novelCell

    const baseLine =
      `${id} | ${date ?? 'unknown'} | total ${activityTotal.toFixed(2)} km | ` +
      `cells novel ${novelCell.toFixed(2)} km (${activityTotal ? ((novelCell / activityTotal) * 100).toFixed(1) : '0'}%)`

    console.log(baseLine)

    if (pool) {
      try {
        const details = await fetchDbDetails(pool, id)
        if (details) {
          if (details.annotation) {
            console.log(`  annotation: ${details.annotation}`)
          } else {
            console.log('  annotation: —')
          }

          if (details.places.length > 0) {
            const formatted = details.places
              .map((place) => {
                const label = place.place_type ? `${place.place_type}` : 'place'
                const name = place.name ?? 'unknown'
                const country = place.country_code ? ` (${place.country_code})` : ''
                return `${label}: ${name}${country}`
              })
              .join(', ')
            console.log(`  new places: ${formatted}`)
          } else {
            console.log('  new places: —')
          }
        } else if (wantsDb) {
          console.log('  annotation/new places: no DB rows found')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`DB lookup failed for activity ${id}: ${message}`)
        console.warn('Disabling further DB lookups for this run.')
        try {
          await pool.end()
        } catch {}
        pool = null
        dbDisabled = true
        console.log('  annotation/new places: unavailable (DB error)')
      }
    } else if (wantsDb && dbDisabled) {
      console.log('  annotation/new places: unavailable (DB error)')
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Total distance: ${totalKm.toFixed(2)} km`)
  console.log(`Novel (grid cell): ${newCellKm.toFixed(2)} km (${totalKm ? ((newCellKm / totalKm) * 100).toFixed(1) : '0'}%)`)
  console.log(`Unique cells: ${visitedCells.size}`)

  if (pool) {
    await pool.end().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
