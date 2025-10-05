import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Home from '../client/routes/Home'

describe('Home route', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_STRAVA_CLIENT_ID = '999'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    vi.restoreAllMocks()
  })

  it('shows connect state when unauthenticated', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authed: false, activityCount: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByRole('link', { name: /connect with strava/i }))
    const connectLink = screen.getByRole('link', { name: /connect with strava/i })
    expect(connectLink).toHaveAttribute('href', expect.stringContaining('activity:write'))
    expect(connectLink).toHaveAttribute('href', expect.stringContaining('client_id=999'))
  })

  it('shows activity summary when authed', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authed: true, activityCount: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByRole('link', { name: /View Progress/i }))
    expect(screen.getByText(/All set!/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View Progress/i })).toBeInTheDocument()
  })
})
