import fs from 'node:fs'
import path from 'node:path'
import polyline from '@mapbox/polyline'

const fixturesDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('fixtures/strava')
const cellGrid = Number(process.env.CELL_GRID || 0.0005)

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

  console.log(
    `${id} | ${date ?? 'unknown'} | total ${activityTotal.toFixed(2)} km | ` +
    `cells novel ${novelCell.toFixed(2)} km (${activityTotal ? ((novelCell / activityTotal) * 100).toFixed(1) : '0'}%)`
  )
}

console.log('\n=== Summary ===')
console.log(`Total distance: ${totalKm.toFixed(2)} km`)
console.log(`Novel (grid cell): ${newCellKm.toFixed(2)} km (${totalKm ? ((newCellKm / totalKm) * 100).toFixed(1) : '0'}%)`)
console.log(`Unique cells: ${visitedCells.size}`)
