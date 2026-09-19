-- The club, as it actually stands.
--
-- Six people: four members and the two coaches. This is the whole roster —
-- the screens used to draw eight invented members and a level spread adding
-- up to 68, and none of it existed.
--
-- What is deliberately NOT filled in here, and why:
--
--   phone       — the club has these; this migration does not, and a made-up
--                 Tanzanian mobile is a real number belonging to a stranger.
--                 Left empty, which the roster renders as "no number on file"
--                 and the profile panel exists to fix. It matters more than
--                 it looks: the number is what joins a member row to their
--                 bookings, so until it is set they show no playing history.
--
--   level       — set after a hitting assessment. Nobody has been assessed in
--                 this database, so everybody is unranked, and the roster
--                 says so rather than inventing a rung.
--
--   paid_until  — NULL, so every member reads as due from day one. That is
--                 the truth until somebody records a payment, and the desk
--                 can clear it in one tap from the profile panel.
--
-- Guarded on an empty table rather than ON CONFLICT: there is no natural key
-- to conflict on (two members really can share a name, and none of these have
-- a number yet), and re-running this must not duplicate the club.
INSERT INTO players (name, role, membership, availability)
SELECT * FROM (VALUES
  ('Brighton Mboya'::text, 'member'::text, 'monthly'::text, 'open'::text),
  ('Daphne Schreur',       'member',       'monthly',       'open'),
  ('Omar Aljuhani',        'member',       'monthly',       'open'),
  ('Laura Jessup',         'member',       'monthly',       'open'),
  -- Coaches are staff: on the roster, off the ladder, and nothing to pay.
  ('Deo',                  'coach',        'payg',          'open'),
  ('Richard',              'coach',        'payg',          'open')
) AS seed(name, role, membership, availability)
WHERE NOT EXISTS (SELECT 1 FROM players);
