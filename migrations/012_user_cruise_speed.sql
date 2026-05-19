-- Cruise speed in knots — used by the report form to compute ETA to nearest
-- port from current coordinates. Integer is enough for vessel cruise speeds
-- (typical range 8–25 kn).
ALTER TABLE users ADD COLUMN IF NOT EXISTS cruise_speed_knots INTEGER;
