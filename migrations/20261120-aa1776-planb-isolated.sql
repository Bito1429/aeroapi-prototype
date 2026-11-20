-- AA1776 Plan B, 20 November 2026: isolated test-only metadata.
-- NO raw AeroAPI responses, tracks, flight plans or finished packages are stored.
-- Tables do not join, update, delete or otherwise touch the existing US campaign or Europe trial.
CREATE TABLE IF NOT EXISTS aa1776_planb_control (
 id integer PRIMARY KEY CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO aa1776_planb_control(id,enabled) VALUES(1,false)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS aa1776_planb_budget (
 usage_date date PRIMARY KEY,
 reserved_mills integer NOT NULL DEFAULT 0 CHECK(reserved_mills BETWEEN 0 AND 2000),
 request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aa1776_planb_state (
 flight_date date PRIMARY KEY CHECK(flight_date IN (DATE '2026-11-24', DATE '2026-11-26')),
 state text NOT NULL,
 reason text,
 fa_flight_id text,
 last_checked_at timestamptz NOT NULL DEFAULT now(),
 ready_at timestamptz
);
