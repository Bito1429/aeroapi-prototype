# US scored-flight investor evidence — read-only audit (13 Nov 2026)
**Status: REVIEW ONLY. No production database alteration, deployment, scheduled task, raw-data deletion or export.**

## Confirmed in US production database
- Scored flights (flight_jobs.method_a_mean_xtd_km non-null): **19,336**; **all 19,336** have flight number (`ident`), `flight_date`, origin, destination and complete three average error fields in `flight_jobs`.
- **All 19,336** have separate `method_a_scores` rows: **96,680** scored checkpoints total (five per scored flight on average), with `total_error_km`, `xtd_km`, `atd_km`, `checkpoint_pct`, `scored_at`, references to the baseline capture and postflight track.
- `flight_score_report` is a SQL **VIEW**, not a separately persisted immutable archive.
- All 19,336 scored flights have separately stored canonical-route **text** and route metrics in relational columns of `flight_captures`, but per-point predicted route geometry/fixes are held within `flight_captures.raw_capture.protocol.fixes`; there is **no demonstrated independent full predicted-route geometry store for each scored flight**.
- The source postflight-track points are in `postflight_tracks.points` and require a separate provider-data retention review. Do not equate source actual track geometry with a freely retainable AevPath-owned derivative.
- `eta_prediction_audit` presently contains **0 production-environment rows**; do not claim individually audited ETA predictions for all scored flights.
- Deleting only the JSON `raw_capture` field (if legally approved and properly tested) would leave `flight_jobs` summaries and `method_a_scores` score rows, but would remove route-fix geometry needed for reconstruction/verification of some predictions; deleting `flight_jobs` would CASCADE into `method_a_scores`, and deleting captures would null some baseline reference IDs.

## Required investor-grade permanent archive (proposed, not yet implemented)
For every scored flight, freeze a single immutable/versioned record with:
1. Identifiers: AevPath evidence ID, flight number, flight date, origin and destination; source account and observation time (non-secret references).
2. Prediction: method version; prediction/lock timestamp; predicted route representation (only the kind legally permitted), any model-generated ETA prediction if genuinely locked and recorded, and the source snapshot hash (without provider raw payload).
3. Evaluation: sample/holdout rules; score time; route-line median cross-track separation and other clearly named metrics (never call route-line error actual plane position accuracy); scoreable/non-scoreable/incident flags and exclusion reasons.
4. Audit: data version, hash of frozen derived evidence, generation/score dates, licence basis, correction history. Keep prior versions on corrections.
5. Retention: independent table/storage and offsite versioned backup, restore test, access logs, export manifest; a 30/24-hour raw-data cleanup must **never** be allowed to DELETE/CASCADE these evidence records. Account for backups and provider-origin content.

### Explicit legal gating
The flight/route identifiers, source-derived filed-route geometry and actual tracks may remain subject to FlightAware contractual restrictions even if normalised or scored. **Tayla must confirm precise fields permitted for long-term retention.** Numeric AevPath error calculations may be safer candidates, but permanent source-derived geometry cannot be assumed licensed.

### Non-destructive implementation sequence (requires separate owner approval)
- Freeze a field allowlist after Tayla reviews the US commercial licence.
- Create versioned `scored_flight_evidence` table, independent of `flight_captures` foreign-key cascades; include hashes/backups.
- Backfill only approved permitted fields from the 19,336 scored rows in a separate job; test reconciliation totals, checksums and samples, without keeping forbidden source fields.
- Require every NEW scored flight to append/update its immutable evidence record *before* raw source expiry, with monitoring for any misses. Do not alter current scoring process until a test proves no effect.
- Separately test the future retention process against evidence preservation and restore.
- Publish a read-only investor data export with data dictionary, limitations, and audit methodology only after licensing approval.

Nothing in this file automatically changes or protects database records; it states the gap and the safe path to close it.
