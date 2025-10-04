import fs from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const DATA_DIR = path.resolve('data/places')

function listGeoJSON(): string[] {
  if (!fs.existsSync(DATA_DIR)) return []
  return fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith('.geojson'))
    .sort()
}

type Feature = {
  type: 'Feature'
  properties?: {
    place_type?: string
    country_code?: string
    admin1_code?: string | null
    name?: string
    metadata?: Record<string, unknown>
  }
  geometry: unknown
}

function loadFile(file: string): Feature[] {
  const fullPath = path.join(DATA_DIR, file)
  if (!fs.existsSync(fullPath)) {
    console.warn(`[load-places] skipping ${file} (not found)`)
    return []
  }
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    return json.features as Feature[]
  }
  throw new Error(`File ${file} is not a FeatureCollection`)
}

function validateFeature(feature: Feature, file: string, index: number) {
  const props = feature.properties || {}
  const { place_type, country_code, name } = props
  if (!place_type || !['country', 'state', 'county', 'city', 'lake'].includes(place_type)) {
    throw new Error(`${file}[${index}] missing valid place_type`)
  }
  if (!country_code) {
    throw new Error(`${file}[${index}] missing country_code`)
  }
  if (!name) {
    throw new Error(`${file}[${index}] missing name`)
  }
  if (!feature.geometry) {
    throw new Error(`${file}[${index}] missing geometry`)
  }
}

async function run() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL required')

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const files = listGeoJSON()
    if (!files.length) {
      console.warn('[load-places] no GeoJSON files found in data/places')
    }

    for (const file of files) {
      const features = loadFile(file)
      if (!features.length) continue
      console.log(`[load-places] loading ${features.length} features from ${file}`)

      for (let i = 0; i < features.length; i += 1) {
        const feature = features[i]
        validateFeature(feature, file, i)
        const props = feature.properties || {}
        const metadata = props.metadata ?? {}
        const jsonGeom = JSON.stringify(feature.geometry)

        await client.query(
          `
          INSERT INTO place_boundary (place_type, country_code, admin1_code, name, geom, metadata)
          VALUES (
            $1,
            $2,
            $3,
            $4,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)),
            $6::jsonb
          )
          ON CONFLICT (place_type, country_code, COALESCE(admin1_code, ''), name) DO NOTHING
          `,
          [
            props.place_type,
            props.country_code,
            props.admin1_code ?? null,
            props.name,
            jsonGeom,
            JSON.stringify(metadata),
          ]
        )
      }
    }

    await client.query('COMMIT')
    console.log('[load-places] complete')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('[load-places] error', err)
  process.exit(1)
})
