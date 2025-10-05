ALTER TABLE place_boundary
  DROP CONSTRAINT IF EXISTS place_boundary_place_type_check;

ALTER TABLE place_boundary
  ADD CONSTRAINT place_boundary_place_type_check
  CHECK (place_type IN ('country', 'state', 'county', 'city', 'lake', 'peak'));
