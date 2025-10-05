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

type DashboardCheckIn = {
  id: string
  visitedAt: string
  placeType: string
  placeName: string
  countryCode: string
  stravaActivityId: string
  activityStart: string
  newMeters: number
  totalMeters: number
  isUnlock: boolean
}

type DashboardReturnStreak = {
  placeBoundaryId: number
  placeName: string
  placeType: string
  countryCode: string
  weeks: number
  lastWeekStart: string
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
  checkIns?: DashboardCheckIn[]
  unlockFeed?: DashboardCheckIn[]
  returnStreaks?: DashboardReturnStreak[]
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
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const formatWeekStart = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

const placeTypeLabels: Record<string, string> = {
  country: 'Country',
  state: 'State/Province',
  county: 'County',
  city: 'City',
  lake: 'Lake',
  peak: 'Peak',
}

const describePlaceType = (placeType: string) => placeTypeLabels[placeType] ?? placeType

const formatCheckInDistance = (
  meters: number,
  fallbackMeters: number,
  preference: MeasurementPreference,
) => {
  if (meters > 0) return formatDistanceByPreference(meters, preference)
  if (fallbackMeters > 0) return formatDistanceByPreference(fallbackMeters, preference)
  return null
}

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
  const checkIns = payload.checkIns ?? []
  const unlockFeed = payload.unlockFeed ?? []
  const returnStreaks = payload.returnStreaks ?? []
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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-display text-xs uppercase tracking-[0.3em] text-retro-sun">
              Recent check-ins
            </h3>
            {checkIns.length === 0 ? (
              <p className="text-sm text-retro-ink/60">
                Unlock a new place to start your check-in streaks.
              </p>
            ) : (
              <ul className="space-y-3">
                {checkIns.slice(0, 6).map((checkIn) => {
                  const distanceText = formatCheckInDistance(
                    checkIn.newMeters,
                    checkIn.totalMeters,
                    measurementPreference,
                  )
                  return (
                    <li
                      key={checkIn.id}
                      className="rounded border border-retro-sun/30 bg-retro-panel/60 px-4 py-3 text-sm shadow-[2px_2px_0_#10261B]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-retro-ink">{checkIn.placeName}</span>
                        <span className="text-retro-ink/60">
                          {formatDateTime(checkIn.visitedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-retro-ink/70">
                        <span>{describePlaceType(checkIn.placeType)}</span>
                        {distanceText ? <span>{distanceText}</span> : null}
                        <span className="font-semibold text-retro-sun">
                          {checkIn.isUnlock ? 'Unlocked!' : 'Check-in'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="font-display text-xs uppercase tracking-[0.3em] text-retro-sun">
              Return streaks
            </h3>
            {returnStreaks.length === 0 ? (
              <p className="text-sm text-retro-ink/60">
                Visit a place more than once to build a streak.
              </p>
            ) : (
              <ul className="space-y-3">
                {returnStreaks.map((streak) => (
                  <li
                    key={streak.placeBoundaryId}
                    className="rounded border border-retro-sun/30 bg-retro-panel/60 px-4 py-3 text-sm shadow-[2px_2px_0_#10261B]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-retro-ink">{streak.placeName}</span>
                      <span className="text-retro-ink/60">
                        Week of {formatWeekStart(streak.lastWeekStart)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-retro-ink/70">
                      <span>{describePlaceType(streak.placeType)}</span>
                      <span className="font-semibold text-retro-sun">
                        {streak.weeks} week{streak.weeks === 1 ? '' : 's'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-display text-xs uppercase tracking-[0.3em] text-retro-sun">
            Recent unlocks
          </h3>
          {unlockFeed.length === 0 ? (
            <p className="text-sm text-retro-ink/60">No new unlocks yet. Chase fresh territory!</p>
          ) : (
            <ul className="space-y-3">
              {unlockFeed.slice(0, 6).map((unlock) => (
                <li
                  key={unlock.id}
                  className="rounded border border-retro-sun/30 bg-retro-panel/60 px-4 py-3 text-sm shadow-[2px_2px_0_#10261B]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-retro-ink">{unlock.placeName}</span>
                    <span className="text-retro-ink/60">{formatDateTime(unlock.visitedAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-retro-ink/70">
                    <span>{describePlaceType(unlock.placeType)}</span>
                    <span>
                      {formatDistanceByPreference(unlock.newMeters, measurementPreference)} new
                    </span>
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
