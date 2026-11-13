# AevPath — Chester US finished-package approval sheet (13 Nov 2026)

**STAGED FOR REVIEW ONLY. NO LIVE DEPLOYMENT.** Approved intent: packages built from existing US production-account captures; no Europe data; no Chester AeroAPI key; no changes to US collection/scoring. FlightAware raw data must be deleted or transformed within 24 hours under applicable terms. Finished AevPath derivative retention requires written licence confirmation from Tayla.

## Exact proposed saved package fields — existing Chester schema v1

- Top-level: `schema` (`aevpath.package.v1`), `schema_minor`, `package_version`, `flight_id`, `market` (`US`), `generated_at`, `expires_at`, `frozen_after`, `attribution`, optional `check_again_after`.
- `flight`: flight number/ICAO identity, airline **code and name**, origin and destination metadata (airport IATA/ICAO codes, names, latitude/longitude and time zones), scheduled departure and arrival, aircraft type, estimated gate-out time.
- `route`: **AevPath-processed** distance and coordinates of predicted route line, named waypoints (name, latitude, longitude and type), route sanity status/reason.
- `corridor`: generated map polygon from the predicted route, 6 km display half-width and a separate statistical 18 km half-width / 80% coverage metadata.
- `timeline`: AevPath-generated estimated waypoints during the flight (minutes since takeoff, coordinates, distance along path, predicted flight phase and modelled ground speed).
- `eta`: expected airborne minutes, landing interval (±9 min, 80% reference coverage), estimated takeoff time and departure interval (±17 min, 80% reference coverage), display text.
- `pois`: currently an empty list of points of interest; no third-party content proposed.

**NOT included:** raw FlightAware API responses or tracks, raw route records, AeroAPI keys, Foresight or `predicted_*` provider fields, other supplier data, user/passenger identity, payment information, personal telemetry, or any Europe trial materials. Whether source-derived fixes/identities and generated geometry are contractually eligible for seven-day retention is **for Tayla to confirm**, not assumed.

## Storage and expiry

- A separate `chester_ready_packages` table holds the finished JSON, an immutable SHA-256 ETag, source account identifier `US_PRODUCTION`, capture timestamp, generation timestamp, scheduled landing timestamp, expiry.
- Maximum expiry is seven days after the stored scheduled arrival; package producer only reads a capture **less than 24 hours old**. Package may be fetched for 7 days after that landing timestamp, including after gate departure; this does not mean still sellable.
- Independent purge script deletes packages at expiry; must be separately scheduled and monitored. Raw data purge is **not yet solved** by this proposal.
- Public Chester APIs get **read-only** package access. A separate limited producer role may insert packages; neither changes US campaign collections/scores. No live changes until owner signs off.

## Requested test cohort

First: Freddie AA1776 PHL (KPHL) → BOS (KBOS), **26 Nov 2026**; exact scheduled departure time, AeroAPI flight ID and preflight enrolment are **not yet confirmed**. The Nov 13 US cohort has **0** jobs matching that flight/date. Next: only other approved named tester flights and 3–5 nearby demonstration flights. No broad scanning or history download.

## API costs

- If reusing existing current US captures: **$0 incremental FlightAware spend** from package build itself.
- If separate small targeted live queries are authorised within **existing US commercial account**: published rates include `/flights/{ident}` $0.005 / result set and `/flights/{id}/route` $0.010 / result set. A basic status+route pair is nominally **$0.015 per one-result-set flight**, before retries, other endpoints or existing account minimums.
- Planning for up to 10 chosen flights with moderate follow-ups: budget **under $1/day incremental**, with a proposed hard stop **$2/day**, to be finalised against the actual US account's usage/cost dashboard; this is a forecast, not confirmed account billing.
- No cap changes to the Europe trial or other campaigns.

## Deployment conditions / blockers

1. Tayla confirms derived-vs-raw boundary and seven-day retention, and reviews existing historical `flight_captures.raw_capture` rows older than 24 hours.
2. Verify independent producer database access using narrow INSERT rights, preserve Chester SELECT-only rights.
3. Apply migration **on isolated test branch only**, run dry-run and Chester checker on a valid current capture, then exercise immutable ETag 200/304 and expiry/cleanup.
4. Secure a specific authorised preflight enrolment plan for Freddie and other tester flights from existing US production AeroAPI account.
5. Owner reviews exact deployment plan (code, env scope, database role, rollback path) **before** any production migration, scheduler or deployment.
6. Old AA1791 Nov 9 cannot be restored just by extending expiry: no derived package was pre-saved. New packages on eligible flights solve the future expiry problem.

## 13 Nov ground stop

The data-only review view and `test/chester-disruption-derived-20261113.json` are deliberately not linked to US production scoring. Flagging is analytical only; the normal historical metric remains immutable. Incident attribution for an individual flight cannot be inferred from schedule delay alone.
