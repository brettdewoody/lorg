import type { Handler } from '@netlify/functions'
import { getPool } from '@shared/db'

type StravaWebhookEvent = {
  object_type?: string
  aspect_type?: string
  owner_id?: number | string
  object_id?: number | string
}

/**
 * Strava Webhook endpoint.
 *
 * Configure your subscription:
 *  POST https://www.strava.com/api/v3/push_subscriptions
 *   -d client_id=...
 *   -d client_secret=...
 *   -d callback_url="https://<your-host>/.netlify/functions/strava-webhook"
 *   -d verify_token="lorg-verify"
 *
 * Strava will:
 *  - GET for verification: include hub.mode=subscribe & hub.challenge
 *  - POST events: { object_type, object_id, aspect_type, owner_id, ... }
 */
export const handler: Handler = async (event) => {
  // Verification challenge
  if (event.httpMethod === 'GET') {
    const qp = event.queryStringParameters || {}
    if (qp['hub.mode'] === 'subscribe' && qp['hub.challenge']) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'hub.challenge': qp['hub.challenge'] }),
      }
    }
    return { statusCode: 400, body: 'Invalid verification' }
  }

  // Receive events
  if (event.httpMethod === 'POST') {
    try {
      const msg = JSON.parse(event.body || '{}') as StravaWebhookEvent

      // We only care about new activities being created
      if (msg.object_type === 'activity' && msg.aspect_type === 'create') {
        const stravaAthleteId = Number(msg.owner_id)
        const stravaActivityId = Number(msg.object_id)

        if (Number.isFinite(stravaAthleteId) && Number.isFinite(stravaActivityId)) {
          const pool = getPool()
          const client = await pool.connect()
          try {
            // Map Strava athlete -> our internal user_id
            const user = await client.query<{ id: string }>(
              `SELECT id FROM app_user WHERE strava_athlete_id=$1`,
              [stravaAthleteId]
            )

            if (user.rowCount) {
              const userId = user.rows[0].id

              // Absolute function URL that works in live/prod/local
              const host = event.headers?.host || ''
              const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
              const scheme = isLocal ? 'http' : 'https'
              const baseUrl = process.env.URL || process.env.DEPLOY_URL || `${scheme}://${host}`

              // Fire background processor
              await fetch(`${baseUrl}/.netlify/functions/activity-process-background`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, stravaActivityId, source: 'webhook' }),
              })
            } else {
              console.warn('Webhook: athlete not found in app_user', { stravaAthleteId })
            }
          } finally {
            client.release()
          }
        }
      }

      // Always 200 to acknowledge receipt (per Strava recommendations)
      return { statusCode: 200, body: 'ok' }
    } catch (err: unknown) {
      console.error('Webhook error', err)
      // Still return 200 to avoid Strava retries storms; log for ops
      return { statusCode: 200, body: 'ok' }
    }
  }

  return { statusCode: 405, body: 'Method not allowed' }
}
