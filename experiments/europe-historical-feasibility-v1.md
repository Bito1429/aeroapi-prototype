# Europe historical-route feasibility — V1 FROZEN

Status: FROZEN 2026-09-29. Geography clarification frozen before sample enumeration. No sampling, method, metric or threshold changes after sample data inspection.

Source protocol: user-supplied "Europe: predicting routes from historical tracks — feasibility protocol".

## Purpose
Test whether a European flight's route can be predicted accurately enough from its own recent flown tracks, without access to a filed flight plan.

## Licence gate
Before any historical data pull:
1. Confirm the active AeroAPI licence permits historical European track retrieval for internal research.
2. Obtain FlightAware's written answer on whether a derived route displayed to a passenger is permitted under the active licence/tier.
3. Until (1) is confirmed, do not execute collection. Until (2) is confirmed, do not treat a positive technical result as shippable product permission.

Public material checked 2026-09-29 indicates AeroAPI Standard publicly permits historical data, internal business research/R&D, derivative works and B2C consumer applications, but the active account/tier and written response remain the controlling product gate.

## Frozen sample frame
- Carriers: Ryanair, easyJet, Jet2, Wizz.
- A route pair is keyed as `carrier|flight_number|origin|destination`.
- "Direct" means a nonstop service physically operated by the named carrier itself. Exclude codeshare/marketing-only flight numbers and any occurrence whose operating carrier is not the named carrier.
- Geography (frozen before sample enumeration): both origin and destination must be in one of the EU-27 member states, the United Kingdom, Norway, Switzerland or Iceland. This rule deliberately excludes Turkey, Azerbaijan, Morocco, Egypt and other non-member states. ECAC is not used because its membership includes Turkey and Azerbaijan.
- Candidate universe: all qualifying direct route pairs inside that geography with at least 9 completed occurrences in the 45 days ending at the cutoff.
- Evaluation cutoff: 2026-09-28 23:59:59 UTC.
- All 9 qualifying occurrences for a selected route must have completed before the cutoff.
- If a route has more than 9 qualifying occurrences in the 45-day window, use the 9 most recent completed occurrences before the cutoff.
- Order those 9 occurrences chronologically: the earliest 6 are training and the latest 3 are evaluation. No post-cutoff occurrence may enter either set.
- 30 distinct route pairs are selected deterministically.
- Canonical selection order: ascending SHA-256 of `carrier|flight_number|origin|destination`.
- Sector class is fixed using median scheduled block time across the 9 qualifying occurrences, where scheduled block time = scheduled_in - scheduled_out.
- Short sector: median scheduled block time <2h.
- Medium sector: median scheduled block time >=2h and <=4h.
- Select 15 short and 15 medium route pairs by lowest hash within each stratum.
- If either stratum has fewer than 15 eligible route pairs, stop and report rather than relaxing the rule after seeing data.

## Frozen prediction rules
- Primary method: median path.
- For each of the 6 training tracks, resample to exactly 101 points at 0%, 1%, ... 100% of distance flown.
- Take the pointwise median latitude and longitude across the six resampled tracks.
- That median path is the predicted route for each of the 3 evaluation occurrences for the same route pair.
- Secondary methods, reported but not decisive:
  - most recent eligible training track;
  - great-circle origin-to-destination path.
- Leakage rule: only tracks from flights that landed before the evaluated flight's notional package-freeze time may be used. Under this historical split, the 6 training occurrences precede the 3 evaluation occurrences by construction; still verify the timestamp rule for every evaluated flight and exclude any violating case rather than substituting another track post hoc.

## Frozen route metrics
- Use US Method A checkpoints: 20%, 40%, 60%, 80% and 95% of the evaluation flight's actual flown distance.
- At each checkpoint, cross-track error is the minimum lateral distance from the actual checkpoint position to the predicted polyline.
- Flight-level route score is the mean cross-track error across those five checkpoints, matching the US campaign's method_a_mean_xtd_km interpretation.
- Across the 90 evaluation flights report median, mean, p90, share with flight-level mean cross-track <=15 km, and share <=50 km.
- Report all three methods separately: median path, most recent training track, great circle.
- Great-circle endpoints are the pointwise medians of the six training tracks' start positions and end positions; no evaluation-track endpoint is used to construct that baseline.

## Frozen success criteria
- Usable: median cross-track <=15 km AND >=70% of evaluated flights within 50 km.
- Marginal: median cross-track >15 km and <=30 km.
- Not usable: median cross-track >30 km OR median-path method is no better than great circle.
- Predeclared expectation: worse than the US filed-route median (~5.4 km); a 10-20 km median would be a good feasibility result.

## Frozen ETA feasibility annex
Purpose: test whether the same six historical flown tracks can support useful post-takeoff ETA estimates without a filed route.

### Inputs and leakage rule
- ETA uses only the six training occurrences for that route plus information available at the evaluation checkpoint.
- No filed route, filed ETE, evaluation-flight future positions, or future timestamps may enter a prediction.
- Every occurrence used for ETA must have valid actual_off and actual_on timestamps and a usable historical flown track with at least two valid timestamped positions.
- Data-completeness replacement rule, frozen before scoring: candidate route pairs are considered in deterministic hash order within each sector stratum. If any of the 9 selected occurrences lacks the required route/ETA data, reject that route pair for data incompleteness and move to the next hash in the same stratum. Never replace a route because its accuracy result is poor.

### ETA predictions
- Takeoff checkpoint: for each of the six training flights compute airborne duration = actual_on - actual_off. Prediction for an evaluation flight = evaluation actual_off + median training airborne duration.
- In-flight checkpoints: 20%, 40%, 60% and 80% of distance flown.
- For each training track, interpolate the timestamp at the relevant fraction of cumulative track distance and compute remaining time from that timestamp to actual_on.
- Historical remaining-time estimate at a checkpoint = median of the six training remaining times.
- For an evaluation flight, interpolate the checkpoint timestamp from its track and predict arrival = checkpoint timestamp + the frozen historical median remaining time.
- Score against evaluation actual_on (runway arrival), not gate-in time.

### ETA metrics
At takeoff, 20%, 40%, 60% and 80% progress report:
- median absolute error in minutes;
- mean absolute error;
- p90 absolute error;
- mean signed error (predicted minus actual);
- share within +/-5 minutes;
- share within +/-10 minutes;
- share within +/-15 minutes.

ETA is a separate feasibility conclusion from route geometry. A route result does not determine the ETA result and vice versa.

## Isolation
This experiment must use a separate endpoint/data path. Do not modify the frozen US registrar, worker selection rules, US scoring logic, or US campaign rows.

## Interpretation
This is a feasibility probe only. Route geometry and ETA are interpreted separately. A positive result on either dimension means that dimension deserves a proper frozen study with a sealed holdout; it is not product proof. A negative result closes that historical-only hypothesis under this method.
