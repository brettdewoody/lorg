import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import Support from '../client/routes/Support'

describe('Support form', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submits successfully', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(null, { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    render(<Support />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Name/i), 'Alex Rider')
    await user.type(screen.getByLabelText(/Email/i), 'alex@example.com')
    await user.type(
      screen.getByLabelText(/Athlete profile/i),
      'https://www.strava.com/athletes/123',
    )
    await user.type(screen.getByLabelText(/How can we help/i), 'Testing support form')

    await user.click(screen.getByRole('button', { name: /Send message/i }))

    await waitFor(() => expect(screen.getByText(/Thanks!/i)).toBeInTheDocument())
    const [url, init] = vi.mocked(window.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
    const params = new URLSearchParams(String(init?.body))
    expect(params.get('name')).toBe('Alex Rider')
  })

  it('shows an error on network failure', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(null, { status: 500, headers: { 'Content-Type': 'application/json' } }),
    )

    render(<Support />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Name/i), 'Alex Rider')
    await user.type(screen.getByLabelText(/Email/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/How can we help/i), 'Testing failure mode')

    await user.click(screen.getByRole('button', { name: /Send message/i }))

    await waitFor(() =>
      expect(screen.getByText(/Something went wrong sending your message/i)).toBeInTheDocument(),
    )
  })
})
