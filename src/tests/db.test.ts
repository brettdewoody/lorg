import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pg', () => {
  class MockClient {
    query = vi.fn(() => Promise.resolve({}))
    release = vi.fn()
  }

  class MockPool {
    connect = vi.fn(() => Promise.resolve(new MockClient()))
    end = vi.fn(() => Promise.resolve())
    on = vi.fn()
  }

  return { Pool: MockPool }
})

const getDbModule = async () => import('../shared/db')

describe('withPg', () => {
  const ORIGINAL_URL = process.env.DATABASE_URL

  beforeEach(() => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
  })

  afterEach(() => {
    process.env.DATABASE_URL = ORIGINAL_URL
  })

  it('executes queries and returns result', async () => {
    const { withPg } = await getDbModule()

    const result = await withPg(async (client) => {
      await client.query('SELECT 1')
      return 'ok'
    })

    expect(result).toBe('ok')
  })

  it('retries once on transient errors', async () => {
    const { withPg } = await getDbModule()

    let attempt = 0
    const result = await withPg(async () => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('Unable to check out process from the pool')
      }
      await Promise.resolve()
      return 'recovered'
    })

    expect(result).toBe('recovered')
    expect(attempt).toBe(2)
  })
})
