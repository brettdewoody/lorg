import React, { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

type Me = { authed: boolean; activityCount: number }
type CellFeature = Feature<Polygon, { cell_x: number; cell_y: number }>
type PlaceFeature = Feature<Polygon | MultiPolygon, {
  place_type: string
  name: string
  country_code: string
  admin1_code?: string | null
}>
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
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [cellFeatures, setCellFeatures] = useState<CellFeature[]>([])
  const [cellsLoading, setCellsLoading] = useState(true)
  const [cellsError, setCellsError] = useState<string | null>(null)
  const [placeFeatures, setPlaceFeatures] = useState<PlaceFeature[]>([])
  const [placesLoading, setPlacesLoading] = useState(true)
  const [placesError, setPlacesError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [fitDone, setFitDone] = useState(false)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapStyle = import.meta.env.VITE_MAPBOX_STYLE_URL || '/map-style.json'

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

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setCountsLoading(true)
        setCountsError(null)
        const res = await fetch('/.netlify/functions/places')
        if (!res.ok) throw new Error(`Failed to load place counts (${res.status})`)
        const data: { counts?: Record<string, number> } = await res.json()
        setPlaceCounts(data.counts ?? {})
      } catch (err) {
        console.error('load place counts error', err)
        const message = err instanceof Error ? err.message : 'Failed to load place counts'
        setCountsError(message)
      } finally {
        setCountsLoading(false)
      }
    }
    fetchCounts()
  }, [])

  useEffect(() => {
    const fetchCells = async () => {
      try {
        setCellsLoading(true)
        setCellsError(null)
        const res = await fetch('/.netlify/functions/visited-cells')
        if (!res.ok) throw new Error(`Failed to load visited cells (${res.status})`)
        const data = await res.json() as FeatureCollection<Polygon, { cell_x: number; cell_y: number }>
        setCellFeatures(data.features ?? [])
        setFitDone(false)
      } catch (err) {
        console.error('load visited cells error', err)
        const message = err instanceof Error ? err.message : 'Failed to load visited cells'
        setCellsError(message)
      } finally {
        setCellsLoading(false)
      }
    }
    fetchCells()
  }, [])

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        setPlacesLoading(true)
        setPlacesError(null)
        const res = await fetch('/.netlify/functions/visited-places')
        if (!res.ok) throw new Error(`Failed to load visited places (${res.status})`)
        const data = await res.json() as FeatureCollection<Polygon | MultiPolygon, PlaceFeature['properties']>
        setPlaceFeatures((data.features as PlaceFeature[] | undefined) ?? [])
        setFitDone(false)
      } catch (err) {
        console.error('load visited places error', err)
        const message = err instanceof Error ? err.message : 'Failed to load visited places'
        setPlacesError(message)
      } finally {
        setPlacesLoading(false)
      }
    }
    fetchPlaces()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const data: FeatureCollection<Polygon, CellFeature['properties']> = {
      type: 'FeatureCollection',
      features: cellFeatures,
    }

    const existingSource = map.getSource('visited-cells') as mapboxgl.GeoJSONSource | undefined
    if (existingSource) {
      existingSource.setData(data)
    } else {
      map.addSource('visited-cells', { type: 'geojson', data })
      map.addLayer({
        id: 'visited-cells-fill',
        type: 'fill',
        source: 'visited-cells',
        paint: {
          'fill-color': '#63FFC1',
          'fill-opacity': 0.55,
        },
      })
      map.addLayer({
        id: 'visited-cells-outline',
        type: 'line',
        source: 'visited-cells',
        paint: {
          'line-color': '#0F3323',
          'line-width': 0.6,
          'line-opacity': 0.6,
        },
      })
    }

    if (mapReady) {
      const placesData: FeatureCollection<Polygon | MultiPolygon, PlaceFeature['properties']> = {
        type: 'FeatureCollection',
        features: placeFeatures,
      }
      const existingPlaces = map.getSource('visited-places') as mapboxgl.GeoJSONSource | undefined
      if (existingPlaces) {
        existingPlaces.setData(placesData)
      } else {
        map.addSource('visited-places', { type: 'geojson', data: placesData })
        map.addLayer({
          id: 'visited-places-fill',
          type: 'fill',
          source: 'visited-places',
          paint: {
            'fill-color': [
              'match',
              ['get', 'place_type'],
              'country', '#1C3A2E',
              'state', '#FF9CB8',
              'county', '#63FFC1',
              'city', '#F8E176',
              'lake', '#5EA9FF',
              '#63FFC1',
            ],
            'fill-opacity': [
              'match',
              ['get', 'place_type'],
              'country', 0.12,
              'state', 0.16,
              'county', 0.22,
              'city', 0.24,
              'lake', 0.28,
              0.2,
            ],
          },
        })
        map.addLayer({
          id: 'visited-places-outline',
          type: 'line',
          source: 'visited-places',
          paint: {
            'line-color': '#0F2A1E',
            'line-width': 0.5,
            'line-opacity': 0.3,
          },
        })
      }
    }

    if (!fitDone) {
      const bbox = computeFeatureBounds(cellFeatures.length ? cellFeatures : placeFeatures)
      if (bbox) {
        const map = mapRef.current
        if (map) {
          map.fitBounds(
            [
              [bbox.minLon, bbox.minLat],
              [bbox.maxLon, bbox.maxLat],
            ],
            { padding: 80, maxZoom: 14, duration: 1000 }
          )
        }
        setFitDone(true)
      }
    }
  }, [cellFeatures, mapReady, fitDone])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const placesData: FeatureCollection<Polygon | MultiPolygon, PlaceFeature['properties']> = {
      type: 'FeatureCollection',
      features: placeFeatures,
    }
    const existingPlaces = map.getSource('visited-places') as mapboxgl.GeoJSONSource | undefined
    if (existingPlaces) {
      existingPlaces.setData(placesData)
    }
  }, [placeFeatures, mapReady])

  const badgeSpecs: Array<{ key: string; label: string }> = [
    { key: 'country', label: 'Countries' },
    { key: 'state', label: 'States/Provinces' },
    { key: 'county', label: 'Counties' },
    { key: 'lake', label: 'Lakes & Reservoirs' },
  ]

  const topBarMessage = countsError ?? placesError ?? cellsError ?? ((cellsLoading || placesLoading || countsLoading) ? 'Loading map…' : '')

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-3">
        <div className="pointer-events-auto w-56 rounded-lg border-2 border-retro-sun/60 bg-retro-panel/85 px-4 py-3 text-retro-ink/90 shadow-[3px_3px_0_#10261B]">
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-retro-ink/60">
            Places unlocked
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {badgeSpecs.map(({ key, label }) => (
              <li key={key} className="flex items-baseline justify-between gap-2">
                <span>{label}</span>
                <span className="font-semibold text-retro-ink">
                  {(placeCounts[key] ?? 0).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {topBarMessage ? (
          <span className="pointer-events-auto w-56 rounded-lg border-2 border-retro-sun/50 bg-retro-panel/80 px-3 py-1 text-[0.65rem] text-retro-ink/80 shadow-[3px_3px_0_#10261B]">
            {topBarMessage}
          </span>
        ) : null}
      </div>
      <div className="map-frame relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />
      </div>
    </div>
  )
}

type Bounds = { minLon: number; minLat: number; maxLon: number; maxLat: number }

function computeFeatureBounds(features: Array<Feature<Polygon | MultiPolygon, unknown>>): Bounds | null {
  if (!features.length) return null
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  features.forEach((feature) => {
    const geom = feature.geometry
    if (!geom) return
    if (geom.type === 'Polygon') {
      geom.coordinates[0]?.forEach((position) => {
        const [lon, lat] = position
        if (lon < minLon) minLon = lon
        if (lat < minLat) minLat = lat
        if (lon > maxLon) maxLon = lon
        if (lat > maxLat) maxLat = lat
      })
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((polygon) => {
        polygon[0]?.forEach((position) => {
          const [lon, lat] = position
          if (lon < minLon) minLon = lon
          if (lat < minLat) minLat = lat
          if (lon > maxLon) maxLon = lon
          if (lat > maxLat) maxLat = lat
        })
      })
    }
  })

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null
  }

  return { minLon, minLat, maxLon, maxLat }
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

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4">
      <div className="w-full max-w-xl space-y-6 border-4 border-black bg-retro-panel-alt/80 px-6 py-8 text-center shadow-retro-panel sm:max-w-2xl sm:px-8 sm:py-10">
        {children}
      </div>
    </div>
  )
}
