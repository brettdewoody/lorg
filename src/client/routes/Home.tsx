import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Me = { authed: boolean; activityCount: number }

export default function Home() {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    fetch('/.netlify/functions/me')
      .then((res) => res.json())
      .then(setMe)
      .catch(() => setMe({ authed: false, activityCount: 0 }))
  }, [])

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID || ''
  const redirect = `${window.location.origin}/.netlify/functions/auth-strava-callback`
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=auto&scope=read,activity:read_all`

  if (!me) return <Center>Loading…</Center>

  if (!me.authed) {
    return (
      <Center>
        <div className="space-y-4">
          <h2 className="font-display text-2xl uppercase tracking-[0.35em] text-retro-sun">Explore your world one activity at a time</h2>
          <p className="text-sm text-retro-ink/75 sm:text-base">
            Start your adventure now—connect with Strava to begin.
          </p>
          <a href={authUrl} className="inline-flex justify-center" aria-label="Connect with Strava">
            <img
              src="/btn_strava_connect_with_white_x2.svg"
              alt="Connect with Strava"
              className="h-12 w-auto drop-shadow-[3px_3px_0_#10261B]"
            />
          </a>
        </div>
      </Center>
    )
  }

  if (me.activityCount === 0) {
    return (
      <Center>
        <h2 className="font-display text-xl uppercase tracking-[0.3em] text-retro-pixel">Connected ✅</h2>
        <p className="text-base text-retro-ink/80">From now on every outdoor activity you record builds your world map. Lace up and earn fresh pixels.</p>
        <Link className="btn" to="/data">View Progress</Link>
      </Center>
    )
  }

  return (
    <Center>
      <h2 className="font-display text-xl uppercase tracking-[0.3em] text-retro-sun">All set!</h2>
      <p className="text-base text-retro-ink/80">You’ve mapped <strong>{me.activityCount}</strong> activities since joining. Keep exploring to unlock new segments.</p>
      <Link className="btn" to="/data">View Progress</Link>
    </Center>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4">
      <div className="w-full max-w-xl space-y-6 border-4 border-black bg-retro-panel-alt/80 px-6 py-8 text-center shadow-retro-panel sm:max-w-2xl sm:px-8 sm:py-10">
        {children}
      </div>
    </div>
  )
}
