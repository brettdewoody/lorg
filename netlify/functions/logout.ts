import type { Handler } from '@netlify/functions'
import { destroySessionCookie } from '@shared/auth'

export const handler: Handler = () => {
  const cookie = destroySessionCookie()
  return Promise.resolve({
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookie,
    },
    body: JSON.stringify({ ok: true }),
  })
}
