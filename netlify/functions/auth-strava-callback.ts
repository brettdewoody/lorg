import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'
import { exchangeCode } from '@shared/strava'
import { createSessionCookie } from '@shared/auth'

export const handler: Handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code
    if (!code) return { statusCode: 400, body: 'Missing code' }
    const tok = await exchangeCode(code)

    const { userId, athleteId } = await withPg(async (client) => {
      const athleteId = tok.athlete?.id
      if (!athleteId) throw new Error('No athlete id in token response')
      const email = tok.athlete?.email ?? null

      const user = await client.query<{ id: string }>(
        `INSERT INTO app_user (strava_athlete_id, email)
         VALUES ($1,$2)
         ON CONFLICT (strava_athlete_id) DO UPDATE SET email=EXCLUDED.email
         RETURNING id`,
        [athleteId, email]
      )
      const createdUserId: string = user.rows[0].id

      await client.query(
        `INSERT INTO strava_token (user_id, access_token, refresh_token, expires_at)
         VALUES ($1,$2,$3,to_timestamp($4))
         ON CONFLICT (user_id) DO UPDATE
           SET access_token=EXCLUDED.access_token,
               refresh_token=EXCLUDED.refresh_token,
               expires_at=EXCLUDED.expires_at`,
        [createdUserId, tok.access_token, tok.refresh_token, tok.expires_at]
      )

      return { userId: createdUserId, athleteId }
    })

    const cookie = await createSessionCookie({ userId, athleteId })
    return { statusCode: 302, headers: { 'Set-Cookie': cookie, Location: '/' } }
  } catch (err: unknown) {
    const statusCode = typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500
    const message = typeof err === 'object' && err && 'message' in err
      ? String((err as { message?: unknown }).message ?? 'Auth error')
      : 'Auth error'
    console.error('OAuth error', err)
    return { statusCode, body: message }
  }
}
