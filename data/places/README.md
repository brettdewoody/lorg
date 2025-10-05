# Place Boundary Import

Copy simplified GeoJSON files into this directory before running the loader. Expected filenames:

- `countries.geojson`
- `states.geojson`
- `counties.geojson`
- `cities_uk.geojson`
- `lakes_uk.geojson`
- `peaks.geojson`

Each feature should include properties:

- `place_type`: `country`, `state`, `county`, `city`, `lake`, or `peak`
- `country_code`: ISO 3166-1 alpha-2 code (e.g., `US`, `CA`, `GB`)
- `name`: human-friendly name
- Optional `admin1_code`: useful for counties to record the parent state/province (e.g., `US-CO`)
- Optional `metadata`: free-form object describing the source, simplification tolerance, etc. Document the dataset/year so future refreshes are repeatable.

Geometries must be MultiPolygon or Polygon in `EPSG:4326`. Simplify beforehand (100–200m tolerance) for best performance.

Once the files are in place, run:

```
npm run places:load
```

The loader uses `INSERT ... ON CONFLICT DO NOTHING`, so rerunning is safe.

## Source notes

### UK cities & large towns

Download the "Major Towns and Cities" dataset from the UK Office for National Statistics (ONS). The ArcGIS item `2db925cd-8151-4904-ba1e-8cbd1f420796` exposes a GeoJSON download in WGS84. Once downloaded:

```bash
mapshaper Major_Towns_and_Cities_December_2023_UK_BUC.geojson \
  -simplify interval=120 keep-shapes \
  -each "place_type='city'; country_code='GB'; admin1_code=null; metadata={source:'ONS', dataset:'Major Towns and Cities', year:2023}" \
  -rename-fields name=TCITY23NM \
  -o format=geojson data/places/cities_uk.geojson
```

`TCITY23NM` holds the city/town name. Adjust the source year if you grab a newer cut.

### UK lakes & reservoirs (top 400)

Use Natural Earth's `ne_10m_lakes` shapefile. After extracting the archive:

```bash
mapshaper ne_10m_lakes.shp \
  -filter 'adm0_a3 == "GBR"' \
  -each 'area_km2 = geom.area / 1e6' \
  -sort area_km2 desc \
  -limit 400 \
  -each "place_type='lake'; country_code='GB'; admin1_code=null; metadata={source:'Natural Earth', scale:'10m', note:'Top 400 by area'}" \
  -clean \
  -rename-fields name=name \
  -o format=geojson data/places/lakes_uk.geojson
```

Natural Earth polygons occasionally include small holes; `-clean` removes slivers before export. Feel free to tweak the simplify tolerance if the file is still heavy.

### Peaks & high points

Point datasets need a small buffer so GPS traces intersect reliably. Start from a curated summit export (Peakbagger, OpenStreetMap `natural=peak`, Database of British and Irish Hills) with latitude/longitude columns:

```bash
mapshaper peaks.csv \
  -point2poly +buffer=0.003 \
  -each "place_type='peak'; country_code=country_code ?? 'US'; admin1_code=null; metadata={source:'OSM', note:'300m buffer'}" \
  -rename-fields name=peak_name \
  -clean \
  -o format=geojson data/places/peaks.geojson
```

- `buffer=0.003` ≈ 300 m at the equator; adjust for your dataset.
- Populate `country_code` (and `admin1_code` if available) so streaks and counts stay regional.
- Keep provenance in `metadata` (elevation, prominence, dataset year) for auditability.
