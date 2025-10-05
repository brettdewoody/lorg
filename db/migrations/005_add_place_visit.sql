CREATE TABLE IF NOT EXISTS place_visit (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  place_boundary_id integer NOT NULL REFERENCES place_boundary(id) ON DELETE CASCADE,
  activity_id bigint NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS place_visit_unique
  ON place_visit(place_boundary_id, activity_id);

CREATE INDEX IF NOT EXISTS place_visit_user_idx
  ON place_visit(user_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS place_visit_user_place_idx
  ON place_visit(user_id, place_boundary_id, visited_at DESC);
