# Place Boundary Import

Copy simplified GeoJSON files into this directory before running the loader. Expected filenames:

- `countries.geojson`
- `states.geojson`
- `counties.geojson`

Each feature should include properties:

- `place_type`: `country`, `state`, or `county`
- `country_code`: ISO 3166-1 alpha-2 code (e.g., `US`, `CA`, `GB`)
- `name`: human-friendly name
- Optional `admin1_code`: useful for counties to record the parent state/province (e.g., `US-CO`)
- Optional `metadata`: free-form object describing the source, simplification tolerance, etc.

Geometries must be MultiPolygon or Polygon in `EPSG:4326`. Simplify beforehand (100–200m tolerance) for best performance.

Once the files are in place, run:

```
npm run places:load
```

The loader uses `INSERT ... ON CONFLICT DO NOTHING`, so rerunning is safe.
