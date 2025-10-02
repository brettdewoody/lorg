import type { Handler } from '@netlify/functions'
import { withPg } from '@shared/db'
import { readSession } from '@shared/auth'

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

    const activityCount = await withPg(async (client) => {
      const { rows } = await client.query<{
        count: string
      }>(`SELECT COUNT(*)::int AS count FROM activity WHERE user_id = $1`, [session.userId])
      return rows[0]?.count ? Number(rows[0].count) : 0
    })

    return json({ authed: true, activityCount })
  } catch (err: unknown) {
    const statusCode = typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500
    const message = typeof err === 'object' && err && 'message' in err
      ? String((err as { message?: unknown }).message ?? 'Error')
      : 'Error'
    console.error('me error', err)
    return json({ authed: false, activityCount: 0, error: message }, statusCode)
  }
}
