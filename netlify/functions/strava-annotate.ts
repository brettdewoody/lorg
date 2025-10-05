import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'
import { refreshToken as refreshStravaToken } from '@shared/strava'

const STRAVA_API_BASE = process.env.STRAVA_API_BASE ?? 'https://www.strava.com/api/v3'
const DRY_RUN = process.env.STRAVA_ANNOTATE_DRYRUN === '1' || !!process.env.STRAVA_FIXTURES
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000

type PendingAnnotation = {
  activity_id: number
  strava_activity_id: number
  annotation_text: string
  annotation_attempts: number
  user_id: string
  access_token: string
  refresh_token: string
  token_exp: number | null
}

type AnnotationResult = {
  activityId: number
  stravaActivityId: number
  status: 'applied' | 'skipped' | 'rate_limited' | 'error' | 'dry_run'
  message?: string
  retryAt?: number | null
}

type TokenResult = {
  accessToken: string
  refreshToken: string
}

async function ensureAccessToken(row: PendingAnnotation): Promise<TokenResult> {
  const expMs = row.token_exp ? Number(row.token_exp) * 1000 : null
  if (expMs && expMs > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return { accessToken: row.access_token, refreshToken: row.refresh_token }
  }

  const refreshed = await refreshStravaToken(row.refresh_token)
  await withPg(async (c) => {
    await c.query(
      `UPDATE strava_token
         SET access_token = $1,
             refresh_token = $2,
             expires_at = to_timestamp($3)
       WHERE user_id = $4`,
      [refreshed.access_token, refreshed.refresh_token, refreshed.expires_at, row.user_id],
    )
  })

  return { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token }
}

async function markApplied(activityId: number) {
  await withPg(async (c) => {
    await c.query(
      `UPDATE activity
         SET annotation_applied_at = now(),
             annotation_attempts = 0
       WHERE id = $1`,
      [activityId],
    )
  })
}

async function recordFailure(activityId: number, attempts: number | null = null) {
  await withPg(async (c) => {
    if (attempts === null) {
      await c.query(
        `UPDATE activity
           SET annotation_attempts = annotation_attempts + 1
         WHERE id = $1`,
        [activityId],
      )
    } else {
      await c.query(
        `UPDATE activity
           SET annotation_attempts = $2
         WHERE id = $1`,
        [activityId, attempts],
      )
    }
  })
}

function parseRateLimitReset(res: Response): number | null {
  const header = res.headers.get('X-RateLimit-Reset')
  if (!header) return null
  const epoch = Number(header.split(',').pop()?.trim())
  if (!Number.isFinite(epoch)) return null
  return epoch * 1000
}

async function processAnnotation(row: PendingAnnotation): Promise<AnnotationResult> {
  if (!row.annotation_text?.trim()) {
    await markApplied(row.activity_id)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'skipped',
      message: 'empty annotation text',
    }
  }

  const { accessToken } = await ensureAccessToken(row)

  if (DRY_RUN) {
    console.warn('[annotate][dry-run]', row.strava_activity_id, row.annotation_text)
    await markApplied(row.activity_id)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'dry_run',
    }
  }

  const detailRes = await fetch(
    `${STRAVA_API_BASE}/activities/${row.strava_activity_id}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (detailRes.status === 429) {
    const retryAt = parseRateLimitReset(detailRes)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'rate_limited',
      retryAt,
    }
  }

  if (!detailRes.ok) {
    const text = await detailRes.text()
    await recordFailure(row.activity_id)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'error',
      message: `detail ${detailRes.status}: ${text.slice(0, 200)}`,
    }
  }

  const detail = (await detailRes.json()) as { description?: string }
  const annotation = row.annotation_text.trim()
  const originalDescription = detail.description ?? ''

  const stripExistingAnnotation = (description: string): string => {
    const paragraphs = description.split(/\n{2,}/).map((p) => p.trim())
    const kept = paragraphs.filter((para) => {
      const normalized = para.trimStart()
      return !normalized.startsWith('🗺️ Unlocked ')
    })
    return kept.join('\n\n').trim()
  }

  const baseDescription = stripExistingAnnotation(originalDescription).trim()
  const description = baseDescription ? `${baseDescription}\n\n${annotation}` : annotation

  if (originalDescription.trim() === description.trim()) {
    await markApplied(row.activity_id)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'skipped',
      message: 'annotation already present',
    }
  }

  const updateRes = await fetch(`${STRAVA_API_BASE}/activities/${row.strava_activity_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  })

  if (updateRes.status === 429) {
    const retryAt = parseRateLimitReset(updateRes)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'rate_limited',
      retryAt,
    }
  }

  if (!updateRes.ok) {
    const text = await updateRes.text()
    await recordFailure(row.activity_id)
    return {
      activityId: row.activity_id,
      stravaActivityId: row.strava_activity_id,
      status: 'error',
      message: `update ${updateRes.status}: ${text.slice(0, 200)}`,
    }
  }

  await markApplied(row.activity_id)
  return {
    activityId: row.activity_id,
    stravaActivityId: row.strava_activity_id,
    status: 'applied',
  }
}

export const handler: Handler = async (event) => {
  try {
    const limitParam = Number(event.queryStringParameters?.limit ?? 5)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 5

    let specificActivityId: number | null = null
    if (event.body) {
      try {
        const parsed = JSON.parse(event.body) as unknown
        if (parsed && typeof parsed === 'object') {
          const maybeActivityId = (parsed as { activityId?: unknown }).activityId
          if (maybeActivityId !== undefined && maybeActivityId !== null) {
            specificActivityId = Number(maybeActivityId)
          }
        }
      } catch {
        // ignore body parse errors
      }
    }

    const pending = await withPg(async (c) => {
      const params: number[] = []
      let query = `
        SELECT a.id AS activity_id,
               a.strava_activity_id,
               a.annotation_text,
               a.annotation_attempts,
               a.user_id,
               t.access_token,
               t.refresh_token,
               EXTRACT(EPOCH FROM t.expires_at) AS token_exp
          FROM activity a
          JOIN strava_token t ON t.user_id = a.user_id
         WHERE a.annotation_text IS NOT NULL
           AND a.annotation_generated_at IS NOT NULL
           AND (a.annotation_applied_at IS NULL OR a.annotation_applied_at < a.annotation_generated_at)
      `

      if (specificActivityId) {
        params.push(specificActivityId)
        query += ` AND a.id = $${params.length}`
      }

      params.push(limit)
      query += ` ORDER BY a.annotation_generated_at ASC LIMIT $${params.length}`

      const res = await c.query<PendingAnnotation>(query, params)
      return res.rows
    })

    if (pending.length === 0) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ processed: 0, results: [] }),
      }
    }

    const results: AnnotationResult[] = []
    for (const row of pending) {
      const result = await processAnnotation(row)
      results.push(result)
      console.info(
        '[strava-annotate]',
        JSON.stringify({
          activityId: result.activityId,
          stravaActivityId: result.stravaActivityId,
          status: result.status,
          message: result.message ?? null,
          retryAt: result.retryAt ?? null,
        }),
      )
      if (result.status === 'rate_limited') {
        break
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processed: results.length, results }),
    }
  } catch (err: unknown) {
    console.error('strava-annotate error', err)
    const message = (err as { message?: unknown })?.message
    return {
      statusCode: 500,
      body: typeof message === 'string' && message.length > 0 ? message : 'Annotation error',
    }
  }
}
