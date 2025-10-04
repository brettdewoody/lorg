import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID ?? process.env.STRAVA_DEV_CLIENT_ID
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? process.env.STRAVA_DEV_CLIENT_SECRET
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN ?? process.env.STRAVA_DEV_REFRESH_TOKEN

if (!CLIENT_ID) {
  console.error('Missing STRAVA_DEV_CLIENT_ID or STRAVA_CLIENT_ID in the environment')
  process.exit(1)
}

if (!CLIENT_SECRET) {
  console.error('Missing STRAVA_DEV_CLIENT_SECRET or STRAVA_CLIENT_SECRET in the environment')
  process.exit(1)
}

if (!REFRESH_TOKEN) {
  console.error('Missing STRAVA_DEV_REFRESH_TOKEN or STRAVA_REFRESH_TOKEN in the environment')
  process.exit(1)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type RateInfo = {
  limitShort: number | null
  limitDaily: number | null
  usageShort: number | null
  usageDaily: number | null
  resetShort: number | null
  resetDaily: number | null
}

function parseRateHeaders(res: Response): RateInfo {
  const parsePair = (value: string | null): [number | null, number | null] => {
    if (!value) return [null, null]
    const [first, second] = value.split(',').map((v) => {
      const n = Number(v.trim())
      return Number.isFinite(n) ? n : null
    })
    return [first ?? null, second ?? null]
  }

  const [limitShort, limitDaily] = parsePair(res.headers.get('X-RateLimit-Limit'))
  const [usageShort, usageDaily] = parsePair(res.headers.get('X-RateLimit-Usage'))
  const [resetShort, resetDaily] = parsePair(res.headers.get('X-RateLimit-Reset'))

  return { limitShort, limitDaily, usageShort, usageDaily, resetShort, resetDaily }
}

async function refreshAccessToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to refresh token: ${res.status} ${text}`)
  }
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function fetchStrava(url: string, options: RequestInit, label: string): Promise<Response> {
  for (;;) {
    const res = await fetch(url, options)

    if (res.status !== 429) {
      return res
    }

    const rate = parseRateHeaders(res)
    const now = Date.now()
    const shortResetMs = rate.resetShort ? Math.max(rate.resetShort * 1000 - now, 0) : null
    const dailyResetMs = rate.resetDaily ? Math.max(rate.resetDaily * 1000 - now, 0) : null

    if (
      rate.limitDaily !== null &&
      rate.usageDaily !== null &&
      rate.usageDaily >= rate.limitDaily - 1
    ) {
      const waitHours = dailyResetMs ? (dailyResetMs / 3600000).toFixed(2) : 'several'
      throw new Error(
        `${label}: daily Strava rate limit reached. Resume after ~${waitHours} hours.`
      )
    }

    const waitMs = shortResetMs !== null ? Math.max(shortResetMs + 5_000, 60_000) : 60_000
    const waitSec = Math.ceil(waitMs / 1000)
    console.warn(
      `${label}: rate limited (429). Sleeping ${waitSec}s before retrying… ` +
      `(usage ${rate.usageShort ?? '?'} / ${rate.limitShort ?? '?'})`
    )
    await sleep(waitMs)
  }
}

const targetDir = path.resolve(process.argv[2] ?? 'fixtures/strava-dev')

async function downloadActivities(accessToken: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  let page = 1
  const perPage = 100
  let total = 0

  const authHeaders = () => ({ Authorization: `Bearer ${accessToken}` })

  const existingSummaries = new Set<string>()
  for (const file of fs.readdirSync(outDir)) {
    const match = file.match(/^(\d+)-summary\.json$/)
    if (match) existingSummaries.add(match[1])
  }

  while (true) {
    const params = new URLSearchParams({ per_page: String(perPage), page: String(page) })
    const res = await fetchStrava(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      { headers: authHeaders() },
      `activities page ${page}`
    )

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Fetch activities failed (${res.status}): ${text}`)
    }
    const activities = await res.json() as any[]
    if (activities.length === 0) break

    for (const activity of activities) {
      total += 1
      const id = activity.id
      const summaryPath = path.join(outDir, `${id}-summary.json`)
      const detailPath = path.join(outDir, `${id}-detail.json`)
      const streamsPath = path.join(outDir, `${id}-streams.json`)

      if (!existingSummaries.has(String(id))) {
        fs.writeFileSync(summaryPath, JSON.stringify(activity, null, 2))
        existingSummaries.add(String(id))
        console.log(`Saved activity ${id} summary`)
      }

      // detail
      if (!fs.existsSync(detailPath)) {
        const detailRes = await fetchStrava(
          `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=false`,
          { headers: authHeaders() },
          `detail ${id}`
        )
        if (detailRes.ok) {
          const detail = await detailRes.json()
          fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2))
          console.log(`Saved activity ${id} detail`)
        } else {
          console.warn(`Failed to fetch detail for activity ${id}: ${detailRes.status}`)
        }
      }

      // streams
      if (!fs.existsSync(streamsPath)) {
        const streamRes = await fetchStrava(
          `https://www.strava.com/api/v3/activities/${id}/streams?keys=latlng&key_by_type=true`,
          { headers: authHeaders() },
          `streams ${id}`
        )
        if (streamRes.ok) {
          const stream = await streamRes.json()
          fs.writeFileSync(streamsPath, JSON.stringify(stream, null, 2))
          console.log(`Saved activity ${id} streams`)
        } else {
          console.warn(`Failed to fetch streams for activity ${id}: ${streamRes.status}`)
        }
      }

      // Gentle pause between activities to avoid burst limits
      await sleep(250)
    }

    if (activities.length < perPage) break
    page += 1

    // Small pause between pages to respect rate limits
    await sleep(1_000)
  }

  console.log(`Downloaded ${total} activities`)
}

async function main() {
  const accessToken = await refreshAccessToken()
  await downloadActivities(accessToken, targetDir)
  console.log(`Fixtures stored in ${targetDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
