import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import type { Feature, Geometry } from 'geojson'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

type Me = { authed: boolean; activityCount: number }
type Activity = {
  id: number; strava_activity_id: number; sport_type: string; start_date: string;
  total_m: number; new_m: number; new_frac: number
}

export default function App() {
  return (
    <div className="topo-bg flex min-h-screen flex-col text-retro-ink">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/data" element={<Data />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

function Header() {
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
          <Link className="transition hover:text-retro-sun" to="/">Home</Link>
          <Link className="transition hover:text-retro-sun" to="/data">Data</Link>
          <Link className="transition hover:text-retro-sun" to="/support">Support</Link>
        </nav>
      </div>
    </header>
  )
}

function Home() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => { fetch('/.netlify/functions/me').then(r=>r.json()).then(setMe).catch(()=>setMe({authed:false, activityCount:0})) }, [])
  const cid = import.meta.env.VITE_STRAVA_CLIENT_ID || ''
  const redirect = `${window.location.origin}/.netlify/functions/auth-strava-callback`
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(cid)}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=auto&scope=read,activity:read_all`

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

function Footer() {
  return (
    <footer className="mt-8 flex w-full justify-center px-4 pb-6">
      <div className="rounded bg-retro-ink/90 px-4 py-2 shadow-[2px_2px_0_#10261B]">
        <img
          src="/api_logo_pwrdBy_strava_horiz_black.svg"
          alt="Powered by Strava"
          className="h-6 w-auto"
        />
      </div>
    </footer>
  )
}

function Data() {
  const [items, setItems] = useState<Activity[]>([])
  const [selected, setSelected] = useState<Activity | null>(null)
const [nextOffset, setNextOffset] = useState<number | null>(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
const [placesError, setPlacesError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapStyle = import.meta.env.VITE_MAPBOX_STYLE_URL || '/map-style.json'

  // init map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: mapStyle,
      center: [-3.864, 56.62],
      zoom: 6,
    })
    mapRef.current = map
    const handleLoad = () => setMapReady(true)
    map.on('load', handleLoad)
    return () => {
      setMapReady(false)
      map.off('load', handleLoad)
      map.remove()
      mapRef.current = null
    }
  }, [mapStyle])

  const loadActivities = useCallback(async (offset: number, append: boolean) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ limit: '50' })
      if (offset > 0) params.set('offset', String(offset))
      const r = await fetch(`/.netlify/functions/activities?${params.toString()}`)
      if (!r.ok) throw new Error(`Failed to load activities (${r.status})`)
      const data: { items?: Activity[]; nextOffset?: number | null } = await r.json()
      const newItems: Activity[] = data.items ?? []
      setItems((prev) => (append ? [...prev, ...newItems] : newItems))
      setSelected((prev) => prev ?? (newItems[0] ?? null))
      setNextOffset(data.nextOffset ?? null)
    } catch (err: unknown) {
      console.error('load activities error', err)
      const message = err instanceof Error ? err.message : 'Failed to load activities'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  // load activities
  useEffect(() => { loadActivities(0, false) }, [loadActivities])

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        setPlacesError(null)
        const res = await fetch('/.netlify/functions/places')
        if (!res.ok) throw new Error(`Failed to load places (${res.status})`)
        const data: { counts?: Record<string, number> } = await res.json()
        setPlaceCounts(data.counts ?? {})
      } catch (err) {
        console.error('load places error', err)
        const message = err instanceof Error ? err.message : 'Failed to load places'
        setPlacesError(message)
      }
    }
    fetchPlaces()
  }, [])

  // draw selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected || !mapReady) return
    ;(async () => {
      const r = await fetch(`/.netlify/functions/activity-geo?id=${selected.id}`)
      if (!r.ok) return
      const gj = await r.json() as { full: Geometry; novel: Geometry }

      // cleanup previous
      ;['full-src','novel-src'].forEach(id=>{
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
      })

      const fullFeature: Feature = { type: 'Feature', geometry: gj.full, properties: {} }
      const novelFeature: Feature = { type: 'Feature', geometry: gj.novel, properties: {} }

      map.addSource('full-src',{ type:'geojson', data: fullFeature })
      map.addSource('novel-src',{ type:'geojson', data: novelFeature })

      map.addLayer({ id:'full-src', type:'line', source:'full-src',
        paint:{ 'line-width':5, 'line-opacity':0.35 }, layout:{ 'line-cap':'round','line-join':'round' } })
      map.addLayer({ id:'novel-src', type:'line', source:'novel-src',
        paint:{ 'line-width':6, 'line-opacity':0.9 }, layout:{ 'line-cap':'round','line-join':'round' } })

      const bbox = computeBbox(gj.full)
      if (bbox) {
        const bounds: mapboxgl.LngLatBoundsLike = [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ]
        map.fitBounds(bounds, { padding: 40, duration: 500 })
      }
    })()
  }, [selected])

  const countryCount = placeCounts.country ?? 0
  const stateCount = placeCounts.state ?? 0
  const countyCount = placeCounts.county ?? 0
const topBarMessage = placesError
  ? placesError
  : loading
    ? 'Loading activities…'
    : error
      ? error
      : `Tracking ${items.length} activities${nextOffset ? ' (more available)' : ''}.`

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 px-4">
        <Badge label="Countries" value={countryCount} />
        <Badge label="States/Provinces" value={stateCount} />
        <Badge label="Counties" value={countyCount} />
      </div>
      <div className="map-frame relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />
      </div>
    </div>
  )
}

function Support() {
  return (
    <div className="px-3 py-6 sm:px-6 lg:px-10">
      <div className="main-shell">
        <section className="space-y-6">
          <HeaderBlock
            title="Support"
            subtitle="Questions, feedback, or bug reports—let us know."
          />
          <p className="text-sm text-retro-ink/80">
            Fill out the form and we&apos;ll get back to you as soon as possible. Include your athlete profile if it helps us investigate.
          </p>
          <form
            name="support"
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            className="space-y-5"
          >
            <input type="hidden" name="form-name" value="support" />
            <p className="hidden">
              <label>
                Don’t fill this out: <input name="bot-field" />
              </label>
            </p>
            <Field label="Name" name="name" autoComplete="name" required />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Athlete profile (optional)" name="profile" placeholder="https://www.strava.com/athletes/..." />
            <FieldTextarea label="How can we help?" name="message" rows={6} required />
            <div data-netlify-recaptcha="true" className="rounded border-2 border-retro-sun/40 bg-retro-panel/60 px-4 py-3 text-xs text-retro-ink/70" />
            <button type="submit" className="btn">Send message</button>
          </form>
        </section>
      </div>
    </div>
  )
}

type HeaderBlockProps = {
  title: string
  subtitle: string
}

function HeaderBlock({ title, subtitle }: HeaderBlockProps) {
  return (
    <header className="space-y-2">
      <h2 className="font-display text-xl uppercase tracking-[0.35em] text-retro-sun sm:text-2xl">
        {title}
      </h2>
      <p className="text-sm text-retro-ink/70 sm:text-base">{subtitle}</p>
    </header>
  )
}

type FieldProps = {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  placeholder?: string
}

function Field({ label, name, type = 'text', autoComplete, required, placeholder }: FieldProps) {
  return (
    <label className="block text-sm text-retro-ink/80">
      <span className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-retro-sun">{label}</span>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border-2 border-retro-sun/40 bg-retro-panel/70 px-4 py-2 text-retro-ink placeholder:text-retro-ink/40 focus:border-retro-sun focus:outline-none"
      />
    </label>
  )
}

type FieldTextareaProps = {
  label: string
  name: string
  rows?: number
  required?: boolean
  placeholder?: string
}

function FieldTextarea({ label, name, rows = 4, required, placeholder }: FieldTextareaProps) {
  return (
    <label className="block text-sm text-retro-ink/80">
      <span className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-retro-sun">{label}</span>
      <textarea
        id={name}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border-2 border-retro-sun/40 bg-retro-panel/70 px-4 py-2 text-retro-ink placeholder:text-retro-ink/40 focus:border-retro-sun focus:outline-none"
      />
    </label>
  )
}

function computeBbox(geom: GeoJSON.Geometry) {
  const coords: number[][] =
    geom.type === 'LineString'
      ? (geom.coordinates as number[][])
      : geom.type === 'MultiLineString'
      ? (geom.coordinates as number[][][]).flat()
      : []
  if (!coords.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x,y] of coords) { if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y }
  return [minX, minY, maxX, maxY]
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

function Badge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[90px] flex-col items-center rounded border-2 border-retro-sun bg-retro-space/60 px-2 py-1 shadow-[2px_2px_0_#10261B]">
      <span className="font-display text-[0.6rem] uppercase tracking-[0.3em] text-retro-sun">{label}</span>
      <span className="text-lg font-semibold text-retro-ink">{value}</span>
    </div>
  )
}
