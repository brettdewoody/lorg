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

type StreakDateRow = {
  place_type: string
  visited_on: string
}

type PlaceStreak = {
  current: number
  longest: number
  lastVisitedOn: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

const toDayIndex = (value: string): number => {
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) ? Math.floor(parsed / MS_PER_DAY) : NaN
}

const todayDayIndex = () => Math.floor(Date.now() / MS_PER_DAY)

const computeStreaks = (rows: StreakDateRow[]): Record<string, PlaceStreak> => {
  const grouped = rows.reduce<Record<string, Set<number>>>((acc, row) => {
    const index = toDayIndex(row.visited_on)
    if (!Number.isFinite(index)) return acc
    if (!acc[row.place_type]) acc[row.place_type] = new Set<number>()
    acc[row.place_type].add(index)
    return acc
  }, {})

  const today = todayDayIndex()

  return Object.entries(grouped).reduce<Record<string, PlaceStreak>>((acc, [type, days]) => {
    const sortedDays = Array.from(days).sort((a, b) => a - b)
    let longest = 0
    let run = 0
    let prev = Number.NaN
    sortedDays.forEach((day) => {
      if (Number.isFinite(prev) && day === prev + 1) {
        run += 1
      } else {
        run = 1
      }
      if (run > longest) longest = run
      prev = day
    })

    let current = 0
    let cursor = today
    while (days.has(cursor)) {
      current += 1
      cursor -= 1
    }

    const lastVisitedIndex = sortedDays.length ? sortedDays[sortedDays.length - 1] : null
    const lastVisitedOn =
      lastVisitedIndex !== null
        ? new Date(lastVisitedIndex * MS_PER_DAY).toISOString().slice(0, 10)
        : null

    acc[type] = {
      current,
      longest,
      lastVisitedOn,
    }
    return acc
  }, {})
}

export const handler: Handler = async (event) => {
  try {
    const { userId } = await requireSession(event)

    const [places, summaries, streakDates] = await withPg(async (c) => {
      const detailPromise = c.query<PlaceRow>(
        `SELECT pb.place_type, pb.name, pb.country_code, pb.admin1_code, vp.visited_at
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
         ORDER BY vp.visited_at DESC
         LIMIT 50`,
        [userId],
      )

      const summaryPromise = c.query<SummaryRow>(
        `SELECT pb.place_type, COUNT(*) AS total
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
         GROUP BY pb.place_type`,
        [userId],
      )

      const streakPromise = c.query<StreakDateRow>(
        `SELECT pb.place_type, (vp.visited_at AT TIME ZONE 'UTC')::date AS visited_on
         FROM visited_place vp
         JOIN place_boundary pb ON pb.id = vp.place_boundary_id
         WHERE vp.user_id = $1
         GROUP BY pb.place_type, visited_on`,
        [userId],
      )

      const [detail, summary, streaks] = await Promise.all([
        detailPromise,
        summaryPromise,
        streakPromise,
      ])
      return [detail.rows, summary.rows, streaks.rows]
    })

    const counts = summaries.reduce<Record<string, number>>((acc, row) => {
      acc[row.place_type] = Number(row.total)
      return acc
    }, {})

    const streaks = computeStreaks(streakDates)

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ places, counts, streaks }),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error'
    return { statusCode: 500, body: message }
  }
}
