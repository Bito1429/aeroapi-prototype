# Canada + Mexico resolver validation policy v0 — frozen before historical cohort retrieval

Frozen: 2026-09-21.

## Scope
Build independent predeparture route resolvers for Canada and Mexico under the same fail-closed validation philosophy used for the U.S. resolver.

Countries:
- Canada: ICAO prefixes C* for airports in scope.
- Mexico: ICAO prefix MM* for airports in scope.

## Information barrier
Cohort membership is determined before retrieving target-flight tracks, actual runway outcomes, or source-arrival tracks.

For each country create at the same time:
- DEVELOPMENT_100: used for parser/resolver development.
- HOLDOUT_100: sealed until the country's resolver + terminal rule is frozen.

The same flight may never appear in both sets.

## Retrospective population rule
Candidate flights must:
1. be completed scheduled commercial passenger flights;
2. have both origin and destination known;
3. have at least one endpoint in the target country;
4. have a non-empty filed route;
5. have scheduled departure within the fixed retrieval window declared before search;
6. be uniquely identified by fa_flight_id.

Selection fields allowed before seal:
- fa_flight_id
- ident
- origin
- destination
- scheduled_out
- scheduled_on
- filed route text
- aircraft type
- scheduled duration

Selection fields forbidden before seal:
- actual runway off/on
- postflight track geometry
- route-decoder canonical geometry
- resolver outcome
- arrival-flow outcome
- any error metric derived from the flown track

## Split
- Compute SHA-256 of fa_flight_id.
- Sort ascending by hash.
- Odd rank among eligible flights -> development pool.
- Even rank -> sealed holdout pool.
- Take first 100 unique flights for each set.
- Freeze both manifests simultaneously.

If fewer than 200 eligible flights exist in the fixed retrieval window, extend the window backward by a predeclared whole number of days and repeat from scratch; never cherry-pick routes or airports.

## Effective-cycle rule
Every reconstruction must use authoritative aeronautical information effective at the evaluated flight's date/time.
No latest-cycle fallback.

Canada:
- State source: NAV CANADA AIP / licensed aeronautical data.
- Machine-readable official data, where required, must come from NAV CANADA's aeronautical data products for the effective cycle.
- Public AIP may be used for independently verifiable enroute/aerodrome facts.
- If procedure coding cannot be obtained authoritatively for the effective cycle, terminal resolution must REFUSE rather than substitute a third-party nav database.

Mexico:
- State source: SENEAM / AFAC AIP Mexico.
- AIP ENR sections are authoritative for ATS routes, radio navigation aids and significant points.
- AD/procedure publications are authoritative for aerodrome and instrument procedures.
- If the effective publication cannot be retrieved authoritatively, resolution must REFUSE; no third-party database silently substitutes for it.

## Comparator and scoring
Historical AeroAPI route geometry remains a comparator, not ground truth.
Common named point tolerance and track arbitration remain exactly as frozen in resolver-validation-policy-v0.md:
- <=1.0 NM point agreement;
- route-level agreement requires >=95% common fixes within 1 NM and zero >5 NM;
- disagreements are arbitrated descriptively against the identical flown track.

## Cross-border routes
Source authority follows the geographic object/procedure:
- U.S. object: FAA NASR/CIFP.
- Canadian object/procedure: NAV CANADA.
- Mexican object/procedure: SENEAM/AFAC.
Identifier collision must be resolved by route context + authoritative jurisdiction; otherwise REFUSE.

Known guard cases remain:
- Mexican UT11/UT34 must never resolve to Utah airport/object identifiers.
- Mexican VER must never resolve to an unrelated U.S. object by bare identifier.

## Terminal flow rule
Arrival-flow prediction, if evaluated, keeps the already-frozen anti-leak standard:
- actual_on < package captured_at is mandatory;
- scheduled/estimated arrival never qualifies;
- missing/ambiguous actual_on excludes the candidate.
Country-specific persistence windows or terminal rules must be frozen on development only before holdout.
