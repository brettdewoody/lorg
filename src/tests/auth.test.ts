import type { HandlerEvent } from '@netlify/functions'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signMock, verifyMock } = vi.hoisted(() => ({
  signMock: vi.fn(),
  verifyMock: vi.fn(() => Promise.resolve({ payload: { userId: 'user-1', athleteId: 42 } })),
}))

vi.mock('jose', () => {
  class MockSignJWT {
    private payload: unknown

    constructor(payload: unknown) {
      this.payload = payload
    }

    setProtectedHeader() {
      return this
    }

    setIssuedAt() {
      return this
    }

    setExpirationTime() {
      return this
    }

    sign() {
      signMock(this.payload)
      return Promise.resolve('mock-jwt')
    }
  }

  return {
    SignJWT: MockSignJWT,
    jwtVerify: verifyMock,
  }
})

import {
  createSessionCookie,
  destroySessionCookie,
  readSession,
  requireSession,
} from '../shared/auth'

describe('auth utilities', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeEach(() => {
    signMock.mockClear()
    verifyMock.mockClear()
    process.env.SESSION_SECRET = 'test-secret'
  })

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret
  })

  it('creates and reads a session cookie', async () => {
    const cookie = await createSessionCookie({ userId: 'user-1', athleteId: 42 })
    expect(signMock).toHaveBeenCalledWith({ userId: 'user-1', athleteId: 42 })

    const event = { headers: { cookie } } as unknown as HandlerEvent
    const session = await readSession(event)
    expect(session).toEqual({ userId: 'user-1', athleteId: 42 })

    const required = await requireSession(event)
    expect(required.userId).toBe('user-1')
  })

  it('returns null for invalid cookie', async () => {
    verifyMock.mockRejectedValueOnce(new Error('invalid token'))
    const event = { headers: { cookie: 'sv_session=invalid' } } as unknown as HandlerEvent
    const session = await readSession(event)
    expect(session).toBeNull()
  })

  it('destroySessionCookie clears cookie immediately', () => {
    const cookie = destroySessionCookie()
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970')
  })
})
