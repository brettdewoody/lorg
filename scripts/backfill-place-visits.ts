import { Pool } from 'pg'
import { exit } from 'node:process'

const BATCH_SIZE = Number.parseInt(process.env.BACKFILL_BATCH_SIZE ?? '250', 10)

async function backfill(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required')
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

  const client = await pool.connect()
  try {
    let offset = 0
    for (;;) {
      const { rows: activities } = await client.query<{
        id: string
        user_id: string
        start_date: string
      }>(
        `
        SELECT id, user_id, start_date
        FROM activity
        WHERE geom IS NOT NULL
        ORDER BY start_date DESC
        OFFSET $1 LIMIT $2
        `,
        [offset, BATCH_SIZE],
      )

      if (!activities.length) break

      for (const activity of activities) {
        await client.query(
          `
          INSERT INTO visited_place (user_id, place_boundary_id, first_activity_id, visited_at)
          SELECT $1, pb.id, $2, $3
          FROM place_boundary pb
          WHERE pb.geom && (SELECT ST_Envelope(geom) FROM activity WHERE id = $2)
            AND ST_Intersects(
              pb.geom,
              (SELECT COALESCE(novel_geom, geom) FROM activity WHERE id = $2)
            )
          ON CONFLICT DO NOTHING
          `,
          [activity.user_id, activity.id, activity.start_date],
        )

        await client.query(
          `
          INSERT INTO place_visit (user_id, place_boundary_id, activity_id, visited_at)
          SELECT $1, pb.id, $2, $3
          FROM place_boundary pb
          WHERE pb.geom && (SELECT ST_Envelope(geom) FROM activity WHERE id = $2)
            AND ST_Intersects(
              pb.geom,
              (SELECT CASE
                WHEN novel_geom IS NOT NULL THEN novel_geom
                ELSE geom
              END FROM activity WHERE id = $2)
            )
          ON CONFLICT DO NOTHING
          `,
          [activity.user_id, activity.id, activity.start_date],
        )
      }

      offset += activities.length
      if (activities.length < BATCH_SIZE) break
      console.log(`Processed ${offset} activities…`)
    }
    console.log('place_visit backfill complete')
  } finally {
    client.release()
    await pool.end()
  }
}

backfill()
  .then(() => {})
  .catch((err: unknown) => {
    console.error('place_visit backfill failed', err)
    exit(1)
  })
