-- Meru Clay — court booking.
--
-- Times are integer minutes from local midnight (Africa/Dar_es_Salaam, UTC+3,
-- no DST). Dates are 'YYYY-MM-DD' strings. See src/lib/time.ts.

CREATE TABLE IF NOT EXISTS courts (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  floodlit  INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO courts (id, name, floodlit) VALUES
  (1, 'Court 1', 1),
  (2, 'Court 2', 0);

CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT    PRIMARY KEY,
  court_id     INTEGER NOT NULL REFERENCES courts(id),
  date         TEXT    NOT NULL,          -- YYYY-MM-DD, local
  start_min    INTEGER NOT NULL,          -- minutes from local midnight
  end_min      INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  phone        TEXT    NOT NULL,
  email        TEXT,
  notes        TEXT,
  -- 'held'      : slot reserved, awaiting payment/confirmation
  -- 'confirmed' : slot is theirs
  -- 'cancelled' : released, kept for the record
  status       TEXT    NOT NULL DEFAULT 'held',
  -- Epoch ms after which a 'held' booking is dead. NULL once confirmed.
  expires_at   INTEGER,
  created_at   INTEGER NOT NULL,
  CHECK (status IN ('held', 'confirmed', 'cancelled')),
  CHECK (end_min > start_min)
);

-- The authoritative guard against double-booking. A court/date/start can be
-- claimed by at most one live booking; cancelled rows are excluded so a slot
-- can be resold. Availability queries are advisory — THIS is what decides.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_slot
  ON bookings (court_id, date, start_min)
  WHERE status IN ('held', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (date, status);

-- Ad-hoc court closures (maintenance, tournaments, resurfacing).
CREATE TABLE IF NOT EXISTS blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id   INTEGER REFERENCES courts(id),   -- NULL = every court
  date       TEXT    NOT NULL,
  start_min  INTEGER NOT NULL,
  end_min    INTEGER NOT NULL,
  reason     TEXT
);

CREATE INDEX IF NOT EXISTS idx_blocks_date ON blocks (date);
