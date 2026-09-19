-- The two courts.
--
-- `bookings.court_id` and `blocks.court_id` point here, so the rows have to
-- exist before anything can be booked. Names and lighting are also declared in
-- COURTS in src/lib/availability.ts, which is what the UI reads; these rows are
-- the referential anchor, and the two must agree.
INSERT INTO courts (id, name, floodlit, active) VALUES
  (1, 'Court A', true,  true),
  (2, 'Court B', false, true)
ON CONFLICT (id) DO UPDATE
  SET name = excluded.name,
      floodlit = excluded.floodlit,
      active = excluded.active;
