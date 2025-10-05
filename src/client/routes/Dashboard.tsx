import { useEffect, useState } from 'react'

type DashboardStats = {
  activityCount: number
  recentNewMeters: number
  recentNewMiles: number
  totalNewMeters: number
  totalNewMiles: number
  totalNewKilometers: number
}

type DashboardMilestone = {
  label: string
  unlockedAt: string | null
}

type DashboardNextMilestone = {
  label: string
  remainingMeters: number
}

type DashboardActivity = {
  id: string
  stravaActivityId: string
  sportType: string
  startDate: string
  newMeters: number
  annotation: string | null
}

type DashboardPayload = {
  authed: boolean
  activityCount: number
  measurementPreference?: string | null
  stats?: DashboardStats
  latestActivities?: DashboardActivity[]
  milestones?: {
    achieved: DashboardMilestone[]
    next: DashboardNextMilestone | null
  }
}

const metersToMiles = (meters: number) => meters / 1_609.34
const metersToKilometers = (meters: number) => meters / 1_000
const metersToFeet = (meters: number) => meters * 3.28084

type MeasurementPreference = 'metric' | 'imperial'

const resolveMeasurementPreference = (value: string | null | undefined): MeasurementPreference => {
  if (!value) return 'imperial'
  const normalized = value.toLowerCase()
  if (normalized === 'meters' || normalized === 'metric' || normalized === 'metres') {
    return 'metric'
  }
  return 'imperial'
}

const formatNumber = (value: number, decimals: number) =>
  Number(value.toFixed(decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })

const formatDistanceByPreference = (
  meters: number,
  preference: MeasurementPreference,
  options: { allowSmallUnits?: boolean } = {},
): string => {
  const { allowSmallUnits = true } = options
  if (preference === 'metric') {
    if (allowSmallUnits && meters < 1_000) {
      const decimals = meters < 100 ? 0 : 1
      return `${formatNumber(meters, decimals)} m`
    }
    const km = metersToKilometers(meters)
    const decimals = km >= 100 ? 0 : 1
    return `${formatNumber(km, decimals)} km`
  }

  const miles = metersToMiles(meters)
  if (allowSmallUnits && miles < 0.1) {
    const feet = metersToFeet(meters)
    const decimals = feet < 100 ? 0 : 0
    return `${formatNumber(feet, decimals)} ft`
  }
  const decimals = miles >= 100 ? 0 : 1
  return `${formatNumber(miles, decimals)} mi`
}

const formatStatValue = (meters: number, preference: MeasurementPreference): string =>
  formatDistanceByPreference(meters, preference)

const formatStatDescription = (
  meters: number,
  preference: MeasurementPreference,
  suffix: string,
): string => `${formatDistanceByPreference(meters, preference)} ${suffix}`

const formatActivityDistance = (meters: number, preference: MeasurementPreference): string =>
  formatDistanceByPreference(meters, preference)

const formatDate = (iso: string) => new Date(iso).toLocaleString()

export default function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/.netlify/functions/me')
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const data = (await res.json()) as DashboardPayload
        setPayload(data)
      } catch (err) {
        console.error('dashboard error', err)
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      }
    }
    load().catch((err) => {
      console.error(err)
      setError('Failed to load dashboard')
    })
  }, [])

  if (!payload) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <p className="text-sm text-retro-ink/60">Loading dashboard…</p>
      </div>
    )
  }

  if (!payload.authed) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="space-y-4 text-center">
          <h2 className="font-display text-xl uppercase tracking-[0.3em] text-retro-sun">
            Sign in to view your dashboard
          </h2>
          <p className="text-sm text-retro-ink/70">
            Connect with Strava from the home page to unlock personalized stats.
          </p>
        </div>
      </div>
    )
  }

  const stats = payload.stats
  const latest = payload.latestActivities ?? []
  const nextMilestone = payload.milestones?.next ?? null
  const measurementPreference = resolveMeasurementPreference(payload.measurementPreference)

  return (
    <div className="px-3 py-6 sm:px-6 lg:px-10">
      <div className="main-shell space-y-6">
        <header className="space-y-2">
          <h2 className="font-display text-xl uppercase tracking-[0.35em] text-retro-sun sm:text-2xl">
            Dashboard
          </h2>
          <p className="text-sm text-retro-ink/70">
            Track your recent exploration, milestones, and latest activities at a glance.
          </p>
        </header>

        {error ? (
          <div className="rounded border border-retro-rose/40 bg-retro-rose/10 px-4 py-3 text-sm text-retro-rose">
            {error}
          </div>
        ) : null}

        {stats ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DashboardStatCard
              title="Activities"
              primary={`${stats.activityCount.toLocaleString()}`}
              description="Total Strava activities processed"
            />
            <DashboardStatCard
              title="New distance (7 days)"
              primary={formatStatValue(stats.recentNewMeters, measurementPreference)}
              description={formatStatDescription(
                stats.recentNewMeters,
                measurementPreference,
                'explored this week',
              )}
            />
            <DashboardStatCard
              title="All-time exploration"
              primary={formatStatValue(stats.totalNewMeters, measurementPreference)}
              description={formatStatDescription(
                stats.totalNewMeters,
                measurementPreference,
                'new territory unlocked',
              )}
            />
            {nextMilestone ? (
              <DashboardStatCard
                title="Next milestone"
                primary={nextMilestone.label}
                description={`${formatStatValue(nextMilestone.remainingMeters, measurementPreference)} to go`}
              />
            ) : (
              <DashboardStatCard
                title="Milestones"
                primary="All caught up!"
                description="You’ve reached every milestone. Keep exploring!"
              />
            )}
            {payload.milestones?.achieved.length ? (
              <DashboardStatCard
                title="Recent achievement"
                primary={payload.milestones.achieved[payload.milestones.achieved.length - 1].label}
                description="Way to explore more of your world!"
              />
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="font-display text-xs uppercase tracking-[0.3em] text-retro-sun">
            Recent activities
          </h3>
          {latest.length === 0 ? (
            <p className="text-sm text-retro-ink/60">
              No activities yet—head out for your first adventure.
            </p>
          ) : (
            <ul className="space-y-3">
              {latest.map((activity) => (
                <li
                  key={activity.id}
                  className="rounded border border-retro-sun/30 bg-retro-panel/60 px-4 py-3 text-sm shadow-[2px_2px_0_#10261B]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-retro-ink">{activity.sportType}</span>
                    <span className="text-retro-ink/60">{formatDate(activity.startDate)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-retro-ink/70">
                    <span>
                      New distance:{' '}
                      {formatActivityDistance(activity.newMeters, measurementPreference)}
                    </span>
                    {activity.annotation ? <span>{activity.annotation}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function DashboardStatCard({
  title,
  primary,
  description,
}: {
  title: string
  primary: string
  description: string
}) {
  return (
    <div className="rounded border border-retro-sun/40 bg-retro-panel/60 px-4 py-3 shadow-[3px_3px_0_#10261B]">
      <h4 className="font-display text-xs uppercase tracking-[0.3em] text-retro-sun">{title}</h4>
      <div className="mt-2 text-lg font-semibold text-retro-ink">{primary}</div>
      <p className="mt-1 text-xs text-retro-ink/70">{description}</p>
    </div>
  )
}
