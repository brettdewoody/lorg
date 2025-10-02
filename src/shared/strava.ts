type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; email?: string }
}

export async function exchangeCode(code: string) {
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
  const data = (await res.json()) as TokenResponse
  return data
}

export async function refreshToken(refresh_token: string) {
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
  return (await res.json()) as TokenResponse
}

export async function getActivity(access_token: string, id: number) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch activity detail')
  return await res.json()
}
