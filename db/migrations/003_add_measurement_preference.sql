ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS measurement_preference text;

COMMENT ON COLUMN app_user.measurement_preference IS 'Strava athlete measurement preference (feet/meters).';
