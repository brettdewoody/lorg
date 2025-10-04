import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { handler as processActivity } from '../netlify/functions/activity-process-background.ts'
import { withPg } from '../src/shared/db'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const usage = `
Usage: node --loader ts-node/esm scripts/replay-fixtures.ts <userId> [fixturesDir] [--report]

Replays Strava fixture JSON files through the background processor.
Set DATABASE_URL in your environment and ensure the activity/visited_cell
 tables are empty or in the desired state before running.
`

function parseArgs() {
  const args = process.argv.slice(2)
  const reportIndex = args.indexOf('--report')
  const shouldReport = reportIndex !== -1
  if (shouldReport) args.splice(reportIndex, 1)

  const [userIdArg, fixturesArg] = args
  if (!userIdArg) {
    console.error(usage)
    process.exit(1)
  }

  return { userIdArg, fixturesArg, shouldReport }
}

async function getOrCreateUser(userIdArg: string) {
  if (UUID_REGEX.test(userIdArg)) {
    const match = await withPg((c) =>
      c.query<{ strava_athlete_id: number }>('SELECT strava_athlete_id FROM app_user WHERE id = $1 LIMIT 1', [userIdArg])
    )

    if (match.rowCount === 0) {
      console.error(
        `No app_user found for id ${userIdArg}. Pass a Strava athlete id instead or create the user before running the replay.`
      )
      process.exit(1)
    }

    return { userId: userIdArg, stravaAthleteId: match.rows[0].strava_athlete_id }
  }

  const athleteNumeric = Number(userIdArg)
  if (!Number.isFinite(athleteNumeric)) {
    console.error('Expected UUID or numeric Strava athlete id, received:', userIdArg)
    process.exit(1)
  }
  const resolved = await withPg(async (c) => {
    const existing = await c.query<{ id: string }>(
      'SELECT id FROM app_user WHERE strava_athlete_id=$1 LIMIT 1',
      [athleteNumeric]
    )
    if (existing.rowCount > 0) return existing.rows[0].id

    const inserted = await c.query<{ id: string }>(
      'INSERT INTO app_user (strava_athlete_id, email) VALUES ($1, NULL) RETURNING id',
      [athleteNumeric]
    )
    return inserted.rows[0].id
  })
  return { userId: resolved, stravaAthleteId: athleteNumeric }
}

function loadSummaries(fixturesDir: string) {
  const entries = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith('-summary.json'))
  const summaries = entries
    .map((file) => {
      const id = Number(file.replace('-summary.json', ''))
      const summary = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'))
      const startDate = summary.start_date_local || summary.start_date || null
      const sportType = summary.sport_type || summary.type || 'unknown'
      return { id, startDate, sportType }
    })
    .filter((item) => Number.isFinite(item.id))
    .sort((a, b) => {
      const aTime = a.startDate ? Date.parse(a.startDate) : 0
      const bTime = b.startDate ? Date.parse(b.startDate) : 0
      return aTime - bTime
    })

  if (summaries.length === 0) {
    console.error(`No summary fixtures found in ${fixturesDir}`)
    process.exit(1)
  }

  return summaries
}

async function fetchActivityReport(activityId: number) {
  const res = await withPg((c) =>
    c.query<{
      strava_activity_id: number
      sport_type: string
      start_date: string
      new_len_m: number | null
      geom_len_m: number | null
      annotation_text: string | null
      visited_names: string[] | null
    }>(
      `
      SELECT a.strava_activity_id,
             a.sport_type,
             a.start_date,
             a.new_len_m,
             a.geom_len_m,
             a.annotation_text,
             ARRAY_REMOVE(ARRAY_AGG(pb.name ORDER BY pb.place_type), NULL) AS visited_names
      FROM activity a
      LEFT JOIN visited_place vp ON vp.first_activity_id = a.id
      LEFT JOIN place_boundary pb ON pb.id = vp.place_boundary_id
      WHERE a.strava_activity_id = $1
      GROUP BY a.id
      `,
      [activityId]
    )
  )

  return res.rows[0] ?? null
}

async function main() {
  const { userIdArg, fixturesArg, shouldReport } = parseArgs()
  const { userId, stravaAthleteId } = await getOrCreateUser(userIdArg)

  await withPg(async (c) => {
    await c.query('BEGIN')
    try {
      await c.query('DELETE FROM visited_place WHERE user_id = $1', [userId])
      await c.query('DELETE FROM visited_cell WHERE user_id = $1', [userId])
      await c.query('DELETE FROM activity WHERE user_id = $1', [userId])
      await c.query('COMMIT')
    } catch (err) {
      await c.query('ROLLBACK')
      throw err
    }
  })

  const fixturesDir = path.resolve(fixturesArg ?? 'fixtures/strava')
  if (!fs.existsSync(fixturesDir)) {
    console.error(`Fixture directory not found: ${fixturesDir}`)
    process.exit(1)
  }

  process.env.STRAVA_FIXTURES = fixturesDir

  const summaries = loadSummaries(fixturesDir)
  const idLabel = stravaAthleteId ? `${userId} (athlete ${stravaAthleteId})` : userId
  console.log(`Replaying ${summaries.length} activities for user ${idLabel} using fixtures at ${fixturesDir}`)

  let processed = 0
  let failures = 0

  for (const { id, startDate, sportType } of summaries) {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ userId, stravaActivityId: id, source: 'fixture' }),
    } as any

    try {
      const res = await processActivity(event, {} as any, () => {})
      const statusCode = (res as any)?.statusCode ?? 200
      const body = (res as any)?.body ?? ''
      processed += 1
      if (statusCode !== 200) {
        failures += 1
        console.warn(`Activity ${id} -> ${statusCode}: ${body}`)
        continue
      }

      if (shouldReport) {
        const report = await fetchActivityReport(id)
        if (report) {
          const distanceKm = report.geom_len_m != null ? (report.geom_len_m / 1000).toFixed(2) : 'n/a'
          const newKm = report.new_len_m != null ? (report.new_len_m / 1000).toFixed(2) : 'n/a'
          const places = (report.visited_names ?? []).join(', ')
          console.log(
            `Activity ${id} (${sportType}) | total ${distanceKm} km | new ${newKm} km | annotation: ${report.annotation_text ?? '—'}${places ? ' | places: ' + places : ''}`
          )
        } else {
          console.log(`Activity ${id} replayed (no row found yet?)`)
        }
      } else {
        console.log(`Processed ${id} (${startDate ?? 'unknown date'})`)
      }
    } catch (err) {
      failures += 1
      console.error(`Error processing ${id}:`, err)
    }
  }

  console.log(`Replay complete. Processed ${processed} activities (${failures} failures).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
