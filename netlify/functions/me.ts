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
        `SELECT COUNT(*)::int AS count FROM activity WHERE user_id = $1`,
        [userId],
      )

      const recentNewDistance = await client.query<{ total: number }>(
        `
        SELECT COALESCE(SUM(new_len_m), 0) AS total
        FROM activity
        WHERE user_id=$1 AND start_date >= now() - interval '7 days'
        `,
        [userId],
      )

      const totalNewDistance = await client.query<{ total: number }>(
        `
        SELECT COALESCE(SUM(new_len_m), 0) AS total
        FROM activity
        WHERE user_id=$1
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
        ORDER BY start_date DESC
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
