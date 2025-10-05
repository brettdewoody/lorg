import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'
import { readSession } from '@shared/auth'

const MILESTONES_METERS: { value: number; label: string }[] = [
  { value: 1_609.34, label: 'Explored 1 new mile' },
  { value: 5_000, label: 'Explored 5 new kilometers' },
  { value: 10_000, label: 'Explored 10 new kilometers' },
  { value: 25_000, label: 'Explored 25 new kilometers' },
  { value: 50_000, label: 'Explored 50 new kilometers' },
  { value: 100_000, label: 'Explored 100 new kilometers' },
]

const metersToMiles = (meters: number) => meters / 1_609.34
const metersToKilometers = (meters: number) => meters / 1_000

function buildMilestones(totalMeters: number) {
  const achieved = MILESTONES_METERS.filter((milestone) => totalMeters >= milestone.value).map(
    (milestone) => ({
      label: milestone.label,
      unlockedAt: null,
    }),
  )

  const next = MILESTONES_METERS.find((milestone) => totalMeters < milestone.value)

  return {
    achieved,
    next: next
      ? {
          label: next.label,
          remainingMeters: Math.max(next.value - totalMeters, 0),
        }
      : null,
  }
}

const json = (body: unknown, statusCode = 200) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  try {
    const session = await readSession(event)
    if (!session) {
      return json({ authed: false, activityCount: 0 })
    }

    const { userId } = session

    const stats = await withPg(async (client) => {
      const userPref = await client.query<{ measurement_preference: string | null }>(
        `SELECT measurement_preference FROM app_user WHERE id=$1`,
        [userId],
      )

      const activityCountRes = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM activity
         WHERE user_id = $1
           AND sport_type NOT IN ('VirtualRide','VirtualRun')`,
        [userId],
      )

      const recentNewDistance = await client.query<{ total: number }>(
        `
        SELECT COALESCE(SUM(new_len_m), 0) AS total
        FROM activity
        WHERE user_id=$1
          AND sport_type NOT IN ('VirtualRide','VirtualRun')
          AND start_date >= now() - interval '7 days'
        `,
        [userId],
      )

      const totalNewDistance = await client.query<{ total: number }>(
        `
        SELECT COALESCE(SUM(new_len_m), 0) AS total
        FROM activity
        WHERE user_id=$1
          AND sport_type NOT IN ('VirtualRide','VirtualRun')
        `,
        [userId],
      )

      const latestActivity = await client.query<{
        id: string
        strava_activity_id: string
        sport_type: string
        start_date: string
        new_len_m: number
        annotation_text: string | null
      }>(
        `
        SELECT id, strava_activity_id, sport_type, start_date, new_len_m, annotation_text
        FROM activity
        WHERE user_id=$1
          AND sport_type NOT IN ('VirtualRide','VirtualRun')
        ORDER BY start_date DESC
        LIMIT 5
        `,
        [userId],
      )

      const checkInsRes = await client.query<{
        id: string
        visited_at: string
        place_type: string
        place_name: string
        country_code: string
        activity_id: string
        strava_activity_id: string
        activity_start: string
        new_len_m: number
        total_len_m: number
        is_unlock: boolean
      }>(
        `
        SELECT
          pv.id,
          pv.visited_at,
          pb.place_type,
          pb.name AS place_name,
          pb.country_code,
          a.id AS activity_id,
          a.strava_activity_id,
          a.start_date AS activity_start,
          COALESCE(a.new_len_m, 0) AS new_len_m,
          COALESCE(a.geom_len_m, 0) AS total_len_m,
          COALESCE(vp.first_activity_id = pv.activity_id, false) AS is_unlock
        FROM place_visit pv
        JOIN place_boundary pb ON pb.id = pv.place_boundary_id
        JOIN activity a ON a.id = pv.activity_id
        LEFT JOIN visited_place vp
          ON vp.user_id = pv.user_id AND vp.place_boundary_id = pv.place_boundary_id
        WHERE pv.user_id = $1
        ORDER BY pv.visited_at DESC
        LIMIT 25
        `,
        [userId],
      )

      const returnStreaksRes = await client.query<{
        place_boundary_id: number
        place_name: string
        place_type: string
        country_code: string
        streak_weeks: number
        streak_end: string
      }>(
        `
        WITH weekly AS (
          SELECT
            pv.place_boundary_id,
            DATE_TRUNC('week', pv.visited_at)::date AS week_start
          FROM place_visit pv
          WHERE pv.user_id = $1
          GROUP BY pv.place_boundary_id, week_start
        ),
        numbered AS (
          SELECT
            place_boundary_id,
            week_start,
            ROW_NUMBER() OVER (PARTITION BY place_boundary_id ORDER BY week_start DESC) AS rn_desc,
            (EXTRACT(YEAR FROM week_start)::int * 100 + EXTRACT(WEEK FROM week_start)::int) AS week_number
          FROM weekly
        ),
        grouped AS (
          SELECT
            place_boundary_id,
            week_start,
            rn_desc,
            week_number,
            week_number - rn_desc AS grp
          FROM numbered
        ),
        streaks AS (
          SELECT
            place_boundary_id,
            MIN(week_start) AS streak_start,
            MAX(week_start) AS streak_end,
            COUNT(*) AS streak_weeks
          FROM grouped
          GROUP BY place_boundary_id, grp
        ),
        latest AS (
          SELECT place_boundary_id, MAX(week_start) AS latest_week
          FROM weekly
          GROUP BY place_boundary_id
        ),
        current AS (
          SELECT s.place_boundary_id, s.streak_end, s.streak_weeks
          FROM streaks s
          JOIN latest l
            ON l.place_boundary_id = s.place_boundary_id
           AND s.streak_end = l.latest_week
        )
        SELECT
          pb.id AS place_boundary_id,
          pb.name AS place_name,
          pb.place_type,
          pb.country_code,
          current.streak_weeks,
          current.streak_end
        FROM current
        JOIN place_boundary pb ON pb.id = current.place_boundary_id
        ORDER BY current.streak_weeks DESC, current.streak_end DESC, pb.name ASC
        LIMIT 5
        `,
        [userId],
      )

      const totalNewMeters = Number(totalNewDistance.rows[0]?.total ?? 0)
      const milestoneData = buildMilestones(totalNewMeters)

      const activityCount = Number(activityCountRes.rows[0]?.count ?? 0)

      const measurementPreference = userPref.rows[0]?.measurement_preference ?? null

      return {
        activityCount,
        recentNewMeters: Number(recentNewDistance.rows[0]?.total ?? 0),
        totalNewMeters,
        latestActivities: latestActivity.rows.map((row) => ({
          id: row.id,
          stravaActivityId: row.strava_activity_id,
          sportType: row.sport_type,
          startDate: row.start_date,
          newMeters: Number(row.new_len_m ?? 0),
          annotation: row.annotation_text,
        })),
        milestones: milestoneData,
        measurementPreference,
        checkIns: checkInsRes.rows.map((row) => ({
          id: row.id,
          visitedAt: row.visited_at,
          placeType: row.place_type,
          placeName: row.place_name,
          countryCode: row.country_code,
          activityId: row.activity_id,
          stravaActivityId: row.strava_activity_id,
          activityStart: row.activity_start,
          newMeters: Number(row.new_len_m ?? 0),
          totalMeters: Number(row.total_len_m ?? 0),
          isUnlock: Boolean(row.is_unlock),
        })),
        returnStreaks: returnStreaksRes.rows.map((row) => ({
          placeBoundaryId: row.place_boundary_id,
          placeName: row.place_name,
          placeType: row.place_type,
          countryCode: row.country_code,
          weeks: Number(row.streak_weeks ?? 0),
          lastWeekStart: row.streak_end,
        })),
      }
    })

    return json({
      authed: true,
      activityCount: stats.activityCount,
      measurementPreference: stats.measurementPreference,
      stats: {
        activityCount: stats.activityCount,
        recentNewMeters: stats.recentNewMeters,
        recentNewMiles: metersToMiles(stats.recentNewMeters),
        totalNewMeters: stats.totalNewMeters,
        totalNewMiles: metersToMiles(stats.totalNewMeters),
        totalNewKilometers: metersToKilometers(stats.totalNewMeters),
      },
      latestActivities: stats.latestActivities,
      milestones: stats.milestones,
      checkIns: stats.checkIns,
      unlockFeed: stats.checkIns.filter((item) => item.isUnlock).slice(0, 10),
      returnStreaks: stats.returnStreaks,
    })
  } catch (err: unknown) {
    const statusCode =
      typeof err === 'object' && err && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode) || 500
        : 500
    const message =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message?: unknown }).message ?? 'Error')
        : 'Error'
    console.error('me error', err)
    return json({ authed: false, activityCount: 0, error: message }, statusCode)
  }
}
