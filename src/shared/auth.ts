import { SignJWT, jwtVerify } from 'jose'
import type { HandlerEvent } from '@netlify/functions'

const COOKIE_NAME = 'sv_session'
const ALG = 'HS256'

function getKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('Missing SESSION_SECRET')
  return new TextEncoder().encode(secret)
}

const isLocalDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production'

type SessionPayload = {
  userId: string
  athleteId: number
  exp?: number
}

export async function createSessionCookie(payload: SessionPayload, maxAgeSec = 60 * 60 * 24 * 30) {
  const key = getKey()
  const jwt = await new SignJWT({ userId: payload.userId, athleteId: payload.athleteId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSec)
    .sign(key)

  const parts = [`${COOKIE_NAME}=${jwt}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAgeSec}`]

  if (isLocalDev) {
    parts.push('SameSite=Lax')
  } else {
    parts.push('Secure', 'SameSite=None')
  }

  return parts.join('; ')
}

export function destroySessionCookie(): string {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    `Expires=${new Date(0).toUTCString()}`,
  ]

  if (isLocalDev) {
    parts.push('SameSite=Lax')
  } else {
    parts.push('Secure', 'SameSite=None')
  }

  return parts.join('; ')
}

export async function readSession(event: HandlerEvent): Promise<SessionPayload | null> {
  try {
    const cookie = event.headers.cookie ?? event.headers.Cookie
    if (!cookie) return null
    const m = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
    if (!m) return null
    const token = m[1]
    const { payload } = await jwtVerify(token, getKey())
    return { userId: String(payload.userId), athleteId: Number(payload.athleteId) }
  } catch {
    return null
  }
}

export async function requireSession(event: HandlerEvent): Promise<SessionPayload> {
  const s = await readSession(event)
  if (!s) {
    const error = new Error('Unauthorized') as Error & { statusCode?: number }
    error.statusCode = 401
    throw error
  }
  return s
}
