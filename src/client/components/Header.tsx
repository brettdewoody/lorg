import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

type SessionState = { authed: boolean }
const readJson = (res: Response): Promise<unknown> => res.json() as Promise<unknown>

export default function Header() {
  const [isAuthed, setIsAuthed] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [loggingOut, setLoggingOut] = useState<boolean>(false)

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch('/.netlify/functions/me')
        if (!res.ok) return
        const raw = await readJson(res)
        if (
          raw &&
          typeof raw === 'object' &&
          'authed' in raw &&
          typeof (raw as SessionState).authed === 'boolean'
        ) {
          setIsAuthed((raw as SessionState).authed)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchSession().catch(() => setLoading(false))
  }, [])

  const handleLogout = async () => {
    try {
      setLoggingOut(true)
      await fetch('/.netlify/functions/logout', { method: 'POST' })
    } finally {
      window.location.assign('/')
    }
  }

  return (
    <header className="border-b-4 border-black bg-retro-panel-alt/95">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-4 px-4 py-4 sm:flex-row">
        <Link
          to="/"
          className="font-display text-xl uppercase tracking-[0.4em] text-retro-sun drop-shadow-[4px_4px_0_#000] sm:text-2xl"
        >
          Lorg
        </Link>
        <nav className="flex gap-4 font-display text-[0.55rem] uppercase tracking-[0.35em] text-retro-ink/70 sm:gap-6 sm:text-[0.65rem]">
          <Link className="transition hover:text-retro-sun" to="/">
            Home
          </Link>
          <Link className="transition hover:text-retro-sun" to="/data">
            Data
          </Link>
          <Link className="transition hover:text-retro-sun" to="/support">
            Support
          </Link>
          {!loading && isAuthed ? (
            <button
              type="button"
              className="transition hover:text-retro-sun disabled:opacity-60"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              {loggingOut ? 'LOGGING OUT…' : 'LOGOUT'}
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
