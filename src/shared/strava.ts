type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; email?: string }
}

const isTokenResponse = (value: unknown): value is TokenResponse => {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.access_token === 'string' &&
    typeof obj.refresh_token === 'string' &&
    typeof obj.expires_at === 'number'
  )
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const cid = process.env.STRAVA_CLIENT_ID
  const secret = process.env.STRAVA_CLIENT_SECRET
  if (!cid || !secret) throw new Error('Missing Strava creds')

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cid,
      client_secret: secret,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Strava token exchange failed')
  const raw: unknown = await res.json()
  if (!isTokenResponse(raw)) throw new Error('Unexpected Strava token response')
  return raw
}

export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  const cid = process.env.STRAVA_CLIENT_ID
  const secret = process.env.STRAVA_CLIENT_SECRET

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cid,
      client_secret: secret,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Strava refresh failed')
  const raw: unknown = await res.json()
  if (!isTokenResponse(raw)) throw new Error('Unexpected Strava token response')
  return raw
}
