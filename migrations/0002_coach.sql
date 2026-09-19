-- Coached sessions.
--
-- A player can ask for a coach alongside the court. This is stored on the
-- booking rather than in a separate table because there is one coach: the
-- flag is enough to know both what to charge and when the coach is spoken for.
--
-- The coach can only be in one place at a time, so availability treats a
-- coached booking as occupying *both* courts for the purposes of other coached
-- bookings. See `occupancy` in src/lib/availability.ts.

ALTER TABLE bookings ADD COLUMN coach INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bookings_coach
  ON bookings (date, coach)
  WHERE coach = 1 AND status IN ('held', 'confirmed');
