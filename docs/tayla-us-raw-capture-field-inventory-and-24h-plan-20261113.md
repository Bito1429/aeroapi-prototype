# For Tayla — US `flight_captures.raw_capture` field names and safe 24-hour plan
**Prepared 13 November 2026. REVIEW DOCUMENT ONLY. Nothing deployed, migrated, deleted or scheduled.**

## What was examined (metadata only)
Read-only SQL inspected **field names**, not stored values. Verified top-level keys over all old records (>24h); verified nested keys across the oldest 1,000 and newest 3,000 old records; checked route-fix item keys across 65,514 items in the newest 3,000 old records. This is an observed field-name inventory, not a formal exhaustive proof that every older row has identical nested structure.

At inspection: 145,899 old non-null `raw_capture` records older than 24h, spanning 20,267 flight jobs; 109,560 old captures marked `ELIGIBLE`; oldest capture 8 September 2026. Counts may change as the campaign runs. No data values were exported.

## Exact field names, grouped plainly

### Top-level record
- `captured_at` — when captured
- `flight` — nested flight-information object
- `protocol` — nested route-processing object
- `route_header_distance` — distance supplied alongside the flight route

### Within `flight`: identity and route
- `fa_flight_id`, `ident`, `origin`, `destination`, `route`, `route_distance`, `aircraft_type`

### Within `flight`: four kinds of flight timing (gate vs runway/touchdown)
- `scheduled_out`, `scheduled_off`, `scheduled_on`, `scheduled_in`
- `estimated_out`, `estimated_off`, `estimated_on`, `estimated_in`
- `actual_out`, `actual_off`, `actual_on`, `actual_in`

### Within `flight`: operational context
- `status`, `filed_ete`, `filed_altitude`
- `actual_runway_off`, `actual_runway_on` **appeared in the 3,000 more-recent old captures, not the 1,000 oldest sampled captures**

### Within `protocol`
- `canonical_route`, `canonical_hash`, `canonical_fix_count`
- `baseline_valid`, `missing_coordinate_fixes`
- `computed_km`, `computed_nm`
- `fixes` (list of filed-route points)

### Within each `protocol.fixes[]` item
- `name`, `type`, `latitude`, `longitude`
- `distance_from_origin`, `distance_this_leg`, `distance_to_destination`
- `outbound_course`

**No actual flight identifiers, coordinates, tracks, customer information, provider payload values or secrets included in this document.**

## Suggested preliminary classification, for Tayla to decide (NOT legal conclusions)

1. **Likely provider-origin content, even when reformatted:** original `flight` identifiers, status, scheduled/estimated/actual times, aircraft, origin/destination, filed route, filed ETE/altitude and provider route fixes and positions. Derived wrappers do not automatically convert these into retained-owned IP.
2. **Likely AevPath calculations, subject to licence wording:** `protocol.canonical_hash`, `canonical_fix_count`, `baseline_valid`, `missing_coordinate_fixes`, `computed_km`, `computed_nm`, and possibly canonicalised route text. Some still reveal or reproduce source route data; assess each, not as one group.
3. **Mixed/risk area:** `protocol.fixes[]` retains provider-coordinate attributes (`distance_*`, `outbound_course`) and values even though arranged by our code. Also the planned seven-day final passenger package keeps generated route coordinates, airports and an AevPath flight timeline. Tayla must approve retained source-derived geometry, identifiers and relevant fields explicitly.
4. **Other columns in `flight_captures` are separate from `raw_capture`:** `canonical_route`, `canonical_hash`, `filed_ete_seconds`, `estimated_out`, etc. A `raw_capture` cleanup would **not** resolve retention duties for those columns or other source tables; carry out a broader inventory before implementation.

## Plan to stop storing raw source material >24h, WITHOUT disrupting US scoring
**Proposal only. NOT approved to run.**

### Step A — legal/data map
- Tayla classifies each source-origin field, derived field, and approved seven-day package field, and confirms the **applicable US licence scope** and deletion obligations. Check legacy historical retention and other raw/materialised columns too. Agree whether we must delete or transform historical rows (separate approval required).
- Inventory all code pathways and database tables containing provider-origin data, not only `raw_capture`.

### Step B — isolate campaign dependencies
- Keep existing capture/checkpoint/scoring jobs and their schedules unchanged.
- Record the scoring dependency: `api/worker.js` reads `base.raw_capture.protocol.fixes` to compare the predicted route with post-flight track, and `latestEligibleBaseline()` in `api/db.js` selects its baseline from `flight_captures`. Deleting or nulling `raw_capture` first would break scoring or cause missing baselines.
- Design a new, narrowly defined **pre-departure derived baseline** containing only Tayla-approved values needed by the score computation, plus metadata proving when it was frozen. Preserve its frozen nature, numeric calibration and per-flight audit history. If fixed source points cannot legally survive 24h, score eligible flights before expiry or seek a specific alternative permission; never assume they are compliant derivatives.
- Post-flight tracking/score data also needs separate classification and retention review.

### Step C — implement & verify in isolation
- Build on a detached test branch/database, no live schedule or US campaign changes.
- Make new capture workflow create the approved minimum baseline promptly, without copying entire provider responses. Update scorer to consume that baseline if available, with controlled fallback while in test. Validate against historical *AevPath-derived* test fixtures, not unapproved raw exports.
- Shadow-compare scoring outcomes and performance, including delayed/overnight flights, missing routes, cancellations, diversions and retries. Check counts, median scores and exactly matching source/frozen-baseline times. Rehearse purge using **metadata-only dry runs**, and model restore/rollback without unsafe raw retention.

### Step D — 24-hour gate & purge (ONLY AFTER approval)
- Retention rule: raw-record cutoff = `captured_at + 24 hours` at the latest (operational buffer proposed: cleanup by 23 hours). Make write timestamps reliable and audit any null/unknown time separately.
- Separately scheduled retention job with small batches, bounded runtime, warnings at 22h and before breach, audit **counts and timestamp-only** metadata. No raw values in logs.
- Fail safe: if pre-departure derivation is missing, block new package publication and raise alert; do **not** silently score from prematurely deleted material or retain raw beyond policy. Define an incident path for impossible 24h transitions.
- Only with explicit approval: replace/null prohibited source fields when no longer needed and dispose of raw payload copies under the agreed rules. **Do not purge non-raw columns blindly.**
- Keep derived passenger packages independent with seven-day availability only if Tayla authorises contents.

### Step E — staged rollout, monitoring and rollback
- Establish a test plan for the US campaign: same scoring throughput, unchanged prediction lock timing, no rise in missing-baseline errors; record 24h retention SLA compliance.
- Deploy behind a separate explicit switch with rollback to the prior scoring code, not automatic restoration of banned raw data. Get owner approval for live deployment and any historical deletion.
- Verify the Chester project can only SELECT finished packages and cannot access FlightAware API keys or raw capture tables.

## Tester collection status
- Approved **in principle only**: selected US production-account tester flights (including Freddie AA1776 PHL→BOS on 26 Nov) plus a few chosen demonstrations, with a **$2/day hard incremental cap** after Tayla authorises the data terms.
- **NOT active**: no new FlightAware key, no new provider calls, no scheduling, no cohort registration, no change in Europe or US campaign.
- Before activation: confirm Freddie's correct flight ID/date, advance enrollment window, current account endpoint pricing, explicit allowable endpoints, a per-day usage ledger and a hard stop at or under $2. No automated retries when there is insufficient remaining budget.

## Requested decisions for Tayla (17 Nov)
1. Which `raw_capture` paths are raw provider material requiring <=24h removal?
2. Which transformed output geometry and summary fields may persist for seven days in AevPath's finished customer package?
3. How do we classify the retained separate `flight_captures` columns and US score-side frozen route baselines?
4. What legally sound treatment is required for existing older records, especially those currently needed by campaign metrics?
5. What audit evidence suffices to prove deletion and avoid raw content in backup/log paths?

**Nothing in this file executes SQL, changes source records, alters campaign jobs, or deploys.**
