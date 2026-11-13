# AevPath permanent scored-flight evidence — FINAL REVIEW DESIGN
**13 November 2026. Draft for owner and Tayla. NOTHING deployed, deleted, scheduled or run against production.**

## Owner's binding rule
> **HARD HOLD: absolutely no raw-data cleanup, truncation, backfill replacement, TTL, table-drop, JSON-field nulling, or any other removal of raw data until BOTH (A) the permanent scored-flight evidence archive has been implemented, backfilled, checked and restore-tested, AND (B) Tayla has given written approval identifying which source/derived fields can be kept.** Passing A and B does NOT authorise cleanup: a separate owner approval and reviewed field-level cleanup plan are still required.
>
> **Never delete whole flight records.** Never delete rows in `flight_jobs`, `flight_captures`, or `postflight_tracks` as a cleanup strategy. If a legal deletion obligation conflicts with preserving rows, consult Tayla before any action; prepare a narrowly scoped legal remedy and seek explicit owner approval. Backups, logs and offsite copies must also be addressed.

This policy is written into the proposal and guarded by an optional fail-closed migration. **No protection is live yet.**

## Current evidence and what it proves
Read-only production check on 13 Nov: **19,336** scored US flights, with **96,680** independently stored checkpoint score records. All scored flights had flight identity, date, origin/destination and the three published mean error columns outside `raw_capture`.

**Missing evidence dimension:** Full frozen predicted-route coordinates are not independently persisted for every flight. Route text and score summary exist; route-fix arrays largely remain in `flight_captures.raw_capture.protocol.fixes`. Do not claim complete prediction archived until resolved. No production-environment rows in `eta_prediction_audit` were found; never fabricate historical per-flight ETA predictions. Postflight raw tracks are a separate retention/legal question.

These scores describe **route-line deviations**, not live moving-dot positional accuracy. Preserve the Method A method and metric definition.

## Archive data model (see SQL design)
- `evidence_v1.scored_flight_revisions`: immutable, independent records keyed by AevPath job UUID + revision. **No foreign keys or ON DELETE CASCADE** to US campaign tables.
- Identity: a stable evidence ID, flight number, date, route, source reference; source account US production.
- The **AevPath score**, full five-checkpoint score vector, scoring method and version, definition and scoring time.
- Prediction provenance: prediction/lock time and method version, licence-approved route representation (nullable), source reference IDs without copying raw responses.
- ETA prediction only where there is independently verified time-locked prediction evidence; otherwise NULL.
- Quality metadata: normal/disruption-reviewed/excluded comparisons and reason (never remove the underlying score); retain scoreable state.
- Full SHA-256 evidence checksum, prior-revision hash, reason for revisions; append new correction rather than overwrite.
- A separate append-only acceptance log records counts, manifest hashes, legal approval reference, and offsite backup/restore exercise results.
- A view of the latest revision gives investors one current row per scored flight while older versions remain retained.

**Access & resilience:** independent INSERT-only writer; auditor/reviewer SELECT-only access; schema/DDL restricted to owner; offsite encrypted/versioned backups, separate permissions, periodic restore test, signed count/checksum manifest. No automatic deletion or data cleanup dependency. Database administrators can override SQL triggers, so backups and operational controls matter.

## Licence boundary: decisions Tayla must make BEFORE archive backfill
1. Which identifiers, timestamps, routes/fix coordinates, scheduled/actual flight times, and provider-derived geometry may be retained indefinitely?
2. Which AevPath predictions count as independently retainable derivations, specifically the **full predicted route**?
3. May numerical error vectors and AevPath-derived flight identifiers be retained? What source references are acceptable?
4. Which outputs can exist only in a 7-day Chester package (and must not be copied to permanent evidence)?
5. How to handle old `raw_capture`, columns duplicated outside JSON, `postflight_tracks.points`, reports, backups, logs and any US licence retention limits?

**Field-level allowlist** to be signed and versioned. Until then, archival backfill must not copy any unapproved provider-origin fields into a permanent table. No assertion of derivative ownership solely because data has been transformed.

## Backfill & new-flight capture — exact safe sequence, nothing activated
1. Confirm the US commercial data agreement and map all sources. Do NOT change campaign capture or scoring.
2. In a disposable, isolated Neon preview branch, apply the archive SQL and exercise permissions and triggers. No Europe trial data and no FlightAware API calls.
3. Build a **dry-run materializer** that reads existing `flight_jobs`, `method_a_scores`, and approved predictions only. Freeze every checkpoint and metric with its definition, methodology, date and source provenance. For historical missing route geometry, mark `CAPTURE_REFERENCE_ONLY` or `NOT_PRESERVED` instead of inventing a prediction.
4. Backfill only after Tayla signs the field allowlist and the owner authorises it. Preserve all score rows. Reconcile complete source counts and numerical values. Monitor and process **new scored flights** into append-only revisions before any source expiry without altering campaign scoring cadence or adding provider requests.
5. Back up archive to independent versioned storage, then perform a real restore to isolated test storage and compare per-record hashes, counts, checkpoint vectors, and provenance.
6. Only after these pass, write a signed archive acceptance event; obtain separate owner approval for any production deployment.
7. Only **then**, and only with an additional explicit owner approval and Tayla-reviewed field-level purge design, can a source-retention change be separately proposed. Always retain whole flight rows.

## Test / release gate — ALL must pass
- Every originally scored flight has exactly one latest archive record; multiple revisions preserve history, no silent overwrites.
- Each of the five Method A score checkpoints agrees with `method_a_scores`; mean scores and identities agree with `flight_jobs`, within documented rounding.
- No route or ETA prediction is claimed unless proved pre-departure locked, traceable and legally retainable. Missing historical geometry remains explicitly missing.
- Correct handling of cancellations, diversion, no-track flights, 13 Nov disruption flags, reroutes, duplicate retries and score corrections. Exclusions never erase scores.
- Zero forbidden fields, Foresight, credentials, direct raw FlightAware responses/tracks in the archive.
- Destructive test in **isolated test database only** proves attempted row DELETE, raw JSON nulling and evidence UPDATE are rejected while the hold applies. **Never run destructive tests against production.**
- Test source expiry against overnight delayed scoring; no campaigns broken. Confirm retention never silently exceeds signed licence because archive needs raw geometry.
- Manifest checksum and full restore pass. Audit approval references stored without exposing legal secrets.
- Owner approves deployment **after seeing exact changes**; separately approves any later cleanup.

## Implementation artefacts on this review branch
- `migrations/scored-flight-evidence-archive-REVIEW-ONLY.sql`: standalone append-only schema / revision tables / immutable trigger.
- `migrations/raw-retention-evidence-hold-REVIEW-ONLY.sql`: proposed fail-closed blockers for raw modification and whole-flight deletes. **Not live**, may require compatibility review.
- `test/scored-evidence-archive-reconciliation-REVIEW-ONLY.sql`: read-only reconciliation examples for an isolated test branch.
- `docs/us-scored-flight-investor-evidence-audit-20261113.md`: initial data inventory.
- This document: hard rule, data contract, legal questions, pass/fail test plan, and rollout/rollback decisions.

## What is NOT done
No deployed archive, data migrated or backfilled, approval from Tayla, validation/restore test, active retention guards, or permission to delete anything. Existing provider retention situation needs legal resolution but **do not start cleanup**.
