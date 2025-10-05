import { useEffect, useRef, useState } from 'react'
import mapboxgl, { AnySourceImpl, GeoJSONSource, Map as MapboxMap } from 'mapbox-gl'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

const toEnvString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const readJson = (res: Response): Promise<unknown> => res.json() as Promise<unknown>

const mapboxAccessToken = toEnvString(import.meta.env.VITE_MAPBOX_TOKEN)
mapboxgl.accessToken = mapboxAccessToken

type CellFeature = Feature<Polygon, { cell_x: number; cell_y: number }>
type PlaceFeature = Feature<
  Polygon | MultiPolygon,
  {
    place_type: string
    name: string
    country_code: string
    admin1_code?: string | null
  }
>

type Bounds = { minLon: number; minLat: number; maxLon: number; maxLat: number }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

type PlaceStreak = {
  current: number
  longest: number
  lastVisitedOn: string | null
}

const parseCounts = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {}
  const countsValue = value.counts
  if (!isObject(countsValue)) return {}
  const result: Record<string, number> = {}
  Object.entries(countsValue).forEach(([key, count]) => {
    if (typeof count === 'number') {
      result[key] = count
    }
  })
  return result
}

const parsePlaceStreaks = (value: unknown): Record<string, PlaceStreak> => {
  if (!isObject(value)) return {}
  const streaksValue = value.streaks
  if (!isObject(streaksValue)) return {}
  const result: Record<string, PlaceStreak> = {}
  Object.entries(streaksValue).forEach(([key, raw]) => {
    if (!isObject(raw)) return
    const current = raw.current
    const longest = raw.longest
    const lastVisitedOn = raw.lastVisitedOn
    if (typeof current !== 'number' || typeof longest !== 'number') return
    if (lastVisitedOn !== null && typeof lastVisitedOn !== 'string') return
    result[key] = {
      current,
      longest,
      lastVisitedOn: lastVisitedOn ?? null,
    }
  })
  return result
}

const formatStreakDate = (value: string | null): string => {
  if (!value) return '–'
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

const isFeatureCollection = (value: unknown): value is FeatureCollection =>
  isObject(value) && value.type === 'FeatureCollection' && Array.isArray(value.features)

const isPolygonGeometry = (geom: unknown): geom is Polygon => {
  if (!isObject(geom) || geom.type !== 'Polygon') return false
  return 'coordinates' in geom && Array.isArray(geom.coordinates)
}

const isMultiPolygonGeometry = (geom: unknown): geom is MultiPolygon => {
  if (!isObject(geom) || geom.type !== 'MultiPolygon') return false
  return 'coordinates' in geom && Array.isArray(geom.coordinates)
}

const parseCellFeatures = (value: unknown): CellFeature[] => {
  if (!isFeatureCollection(value)) return []
  const result: CellFeature[] = []
  value.features.forEach((feature) => {
    if (!isObject(feature) || feature.type !== 'Feature') return
    const properties = feature.properties
    if (!isObject(properties)) return
    const cellX = properties.cell_x
    const cellY = properties.cell_y
    if (typeof cellX !== 'number' || typeof cellY !== 'number') return
    const geometry = feature.geometry
    if (!isPolygonGeometry(geometry)) return
    result.push({
      type: 'Feature',
      properties: { cell_x: cellX, cell_y: cellY },
      geometry,
    })
  })
  return result
}

const parsePlaceFeatures = (value: unknown): PlaceFeature[] => {
  if (!isFeatureCollection(value)) return []
  const result: PlaceFeature[] = []
  value.features.forEach((feature) => {
    if (!isObject(feature) || feature.type !== 'Feature') return
    const properties = feature.properties
    if (!isObject(properties)) return
    const placeType = properties.place_type
    const name = properties.name
    const countryCode = properties.country_code
    const adminRaw = properties.admin1_code
    if (
      typeof placeType !== 'string' ||
      typeof name !== 'string' ||
      typeof countryCode !== 'string'
    ) {
      return
    }
    if (adminRaw !== undefined && adminRaw !== null && typeof adminRaw !== 'string') return
    const geometry = feature.geometry
    if (!isPolygonGeometry(geometry) && !isMultiPolygonGeometry(geometry)) return
    result.push({
      type: 'Feature',
      properties: {
        place_type: placeType,
        name,
        country_code: countryCode,
        admin1_code: typeof adminRaw === 'string' ? adminRaw : null,
      },
      geometry,
    })
  })
  return result
}

const isGeoJSONSource = (source: AnySourceImpl | undefined): source is GeoJSONSource =>
  Boolean(source && source.type === 'geojson')

export default function Data() {
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
  const [placeStreaks, setPlaceStreaks] = useState<Record<string, PlaceStreak>>({})
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
  const mapRef = useRef<MapboxMap | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapStyle = toEnvString(import.meta.env.VITE_MAPBOX_STYLE_URL, '/map-style.json')

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
    const fetchPlaceSummary = async () => {
      try {
        setCountsLoading(true)
        setCountsError(null)
        const res = await fetch('/.netlify/functions/places')
        if (!res.ok) throw new Error(`Failed to load place counts (${res.status})`)
        const raw = await readJson(res)
        setPlaceCounts(parseCounts(raw))
        setPlaceStreaks(parsePlaceStreaks(raw))
      } catch (err) {
        console.error('load place counts error', err)
        const message = err instanceof Error ? err.message : 'Failed to load place counts'
        setCountsError(message)
      } finally {
        setCountsLoading(false)
      }
    }
    void fetchPlaceSummary()
  }, [])

  useEffect(() => {
    const fetchCells = async () => {
      try {
        setCellsLoading(true)
        setCellsError(null)
        const res = await fetch('/.netlify/functions/visited-cells')
        if (!res.ok) throw new Error(`Failed to load visited cells (${res.status})`)
        const raw = await readJson(res)
        setCellFeatures(parseCellFeatures(raw))
        setFitDone(false)
      } catch (err) {
        console.error('load visited cells error', err)
        const message = err instanceof Error ? err.message : 'Failed to load visited cells'
        setCellsError(message)
      } finally {
        setCellsLoading(false)
      }
    }
    void fetchCells()
  }, [])

  useEffect(() => {
    const fetchPlaces = async () => {
      try {
        setPlacesLoading(true)
        setPlacesError(null)
        const res = await fetch('/.netlify/functions/visited-places')
        if (!res.ok) throw new Error(`Failed to load visited places (${res.status})`)
        const raw = await readJson(res)
        setPlaceFeatures(parsePlaceFeatures(raw))
        setFitDone(false)
      } catch (err) {
        console.error('load visited places error', err)
        const message = err instanceof Error ? err.message : 'Failed to load visited places'
        setPlacesError(message)
      } finally {
        setPlacesLoading(false)
      }
    }
    void fetchPlaces()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const data: FeatureCollection<Polygon, CellFeature['properties']> = {
      type: 'FeatureCollection',
      features: cellFeatures,
    }

    const existingSource = map.getSource('visited-cells')
    if (isGeoJSONSource(existingSource)) {
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
      const existingPlaces = map.getSource('visited-places')
      if (isGeoJSONSource(existingPlaces)) {
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
              'country',
              '#1C3A2E',
              'state',
              '#FF9CB8',
              'county',
              '#63FFC1',
              'city',
              '#F8E176',
              'lake',
              '#5EA9FF',
              'peak',
              '#E58CFF',
              '#63FFC1',
            ],
            'fill-opacity': [
              'match',
              ['get', 'place_type'],
              'country',
              0.12,
              'state',
              0.16,
              'county',
              0.22,
              'city',
              0.24,
              'lake',
              0.28,
              'peak',
              0.32,
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
            { padding: 80, maxZoom: 14, duration: 1000 },
          )
        }
        setFitDone(true)
      }
    }
  }, [cellFeatures, mapReady, fitDone, placeFeatures])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const placesData: FeatureCollection<Polygon | MultiPolygon, PlaceFeature['properties']> = {
      type: 'FeatureCollection',
      features: placeFeatures,
    }
    const existingPlaces = map.getSource('visited-places')
    if (isGeoJSONSource(existingPlaces)) {
      existingPlaces.setData(placesData)
    }
  }, [placeFeatures, mapReady])

  const badgeSpecs: { key: string; label: string }[] = [
    { key: 'country', label: 'Countries' },
    { key: 'state', label: 'States/Provinces' },
    { key: 'county', label: 'Counties' },
    { key: 'lake', label: 'Lakes & Reservoirs' },
    { key: 'peak', label: 'Peaks bagged' },
  ]

  const topBarMessage =
    countsError ??
    placesError ??
    cellsError ??
    (cellsLoading || placesLoading || countsLoading ? 'Loading map…' : '')

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
        {Object.keys(placeStreaks).length ? (
          <div className="pointer-events-auto w-56 rounded-lg border-2 border-retro-sun/50 bg-retro-panel/85 px-4 py-3 text-retro-ink/90 shadow-[3px_3px_0_#10261B]">
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-retro-ink/60">
              Streaks
            </div>
            <ul className="mt-2 space-y-2 text-[0.7rem]">
              {badgeSpecs.map(({ key, label }) => {
                const streak = placeStreaks[key]
                if (!streak) return null
                return (
                  <li key={key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{label}</span>
                      <span className="font-semibold text-retro-ink">{streak.current}d</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[0.65rem] text-retro-ink/70">
                      <span>Best: {streak.longest}d</span>
                      <span>Last: {formatStreakDate(streak.lastVisitedOn)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
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

function computeFeatureBounds(features: Feature<Polygon | MultiPolygon, unknown>[]): Bounds | null {
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

  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return null
  }

  return { minLon, minLat, maxLon, maxLat }
}
