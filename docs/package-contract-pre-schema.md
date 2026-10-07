# Draft package contract — pre Chester schema v1

Status: implementation scaffold only. Field names and nesting are provisional until Chester Apps publishes schema v1. Do not treat this document as the mobile contract.

Endpoint:
GET /internal/flights/{id}/package

Current behaviour:
- 404 FLIGHT_NOT_FOUND
- 202 PENDING_ROUTE when the flight exists but no usable route is available
- 200 with non-sellable sale state for CANCELLED, DEPARTED or UNSUPPORTED_MARKET
- 200 READY package for sellable supported flights
- ETag returned on ready packages; matching If-None-Match returns 304

Implemented package content:
- flight identity, origin/destination, scheduled out, latest estimated off
- sale state
- canonical route/fixes/hash
- resolver sanity flag and reason
- timeline resampled to satisfy both <=2 minutes and <=25 km spacing
- ETA v1 calibration metadata and predeparture ~80% landing window
- airborne landing-window rule/width ready for on-device detected-takeoff input
- statistically calibrated route-confidence corridor: +/-18 km half-width and polygon
- package version and source capture timestamp

Deliberately separate:
- confidence corridor is statistical; no narrower display/visual corridor is frozen here
- ETA window calibration does not claim AevPath beats filed flight duration
- generated_at is excluded from ETag content hashing

Still pending:
- exact Chester schema names/types/nesting
- schema conformance tests
- ETA audit table is live in Neon; runtime persistence wiring is on this branch and must be retained through schema mapping
- takeoff event ingestion feeding the airborne ETA centre
- final authentication/internal-access policy

Passenger-facing terminology rule:
- use "landing" or "touchdown", never "arrival", for takeoff + filed-ETE timing windows; gate arrival is a different event.
