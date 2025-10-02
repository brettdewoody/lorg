
-- Enable postgis (Supabase: already available)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_athlete_id bigint UNIQUE NOT NULL,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strava_token (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  strava_activity_id bigint UNIQUE NOT NULL,
  sport_type text NOT NULL,
  start_date timestamptz NOT NULL,
  raw_polyline text,
  geom geometry(LineString, 4326),
  masked_geom geometry(MultiLineString, 4326),
  novel_geom geometry(MultiLineString, 4326),
  masked_geom_s geometry(MultiLineString, 4326),
  novel_geom_s geometry(MultiLineString, 4326),
  geom_len_m double precision,
  new_len_m double precision,
  new_frac double precision,
  novel_cell_count integer DEFAULT 0,
  annotation_text text,
  annotation_generated_at timestamptz,
  annotation_applied_at timestamptz,
  annotation_attempts integer DEFAULT 0,
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity(user_id);
CREATE INDEX IF NOT EXISTS activity_geom_idx ON activity USING GIST(geom);
CREATE INDEX IF NOT EXISTS activity_masked_geom_idx ON activity USING GIST(masked_geom);
CREATE INDEX IF NOT EXISTS activity_novel_geom_idx ON activity USING GIST(novel_geom);

CREATE TABLE IF NOT EXISTS visited_cell (
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  cell_x integer NOT NULL,
  cell_y integer NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cell_x, cell_y)
);

CREATE TABLE IF NOT EXISTS privacy_zone (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  center geometry(Point,4326) NOT NULL,
  radius_m integer NOT NULL DEFAULT 500
);

CREATE TABLE IF NOT EXISTS place_boundary (
  id SERIAL PRIMARY KEY,
  place_type text NOT NULL CHECK (place_type IN ('country','state','county')),
  country_code text NOT NULL,
  admin1_code text,
  name text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS place_boundary_unique
  ON place_boundary(place_type, country_code, COALESCE(admin1_code, ''), name);

CREATE INDEX IF NOT EXISTS place_boundary_geom_idx
  ON place_boundary USING GIST (geom);

CREATE TABLE IF NOT EXISTS visited_place (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  place_boundary_id integer NOT NULL REFERENCES place_boundary(id) ON DELETE CASCADE,
  first_activity_id bigint NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_boundary_id)
);

CREATE INDEX IF NOT EXISTS visited_place_boundary_idx
  ON visited_place(place_boundary_id);
