# Europe historical-route feasibility — V1 freeze candidate

Status: DRAFT FOR FREEZE — no AeroAPI historical data may be pulled until the licence gate and sampling-frame choices below are explicitly resolved.

Source protocol: user-supplied "Europe: predicting routes from historical tracks — feasibility protocol".

## Purpose
Test whether a European flight's route can be predicted accurately enough from its own recent flown tracks, without access to a filed flight plan.

## Licence gate
Before any historical data pull:
1. Confirm the active AeroAPI licence permits historical European track retrieval for internal research.
2. Obtain FlightAware's written answer on whether a derived route displayed to a passenger is permitted under the active licence/tier.
3. Until (1) is confirmed, do not execute collection. Until (2) is confirmed, do not treat a positive technical result as shippable product permission.

Public material checked 2026-09-29 indicates AeroAPI Standard publicly permits historical data, internal business research/R&D, derivative works and B2C consumer applications, but the active account/tier and written response remain the controlling product gate.

## Frozen source rules
- Carriers: Ryanair, easyJet, Jet2, Wizz.
- 30 distinct flight-number/route pairs.
- Spread across short (<2h) and medium (2–4h) sectors.
- Training: 6 most recent completed occurrences before evaluation.
- Evaluation: next 3 occurrences; 90 evaluated flights total.
- Cutoff: only tracks landed before the evaluated flight's notional package-freeze time may enter prediction.
- Primary method: median path after resampling each training track by fraction of distance flown.
- Secondary: most recent track; great circle.
- Metric: same cross-track measure as US campaign.
- Report median, mean, p90, share <=15 km, share <=50 km.
- Usable: median <=15 km AND >=70% within 50 km.
- Marginal: median 15–30 km.
- Not usable: median >30 km OR no better than great circle.
- Expected: worse than US filed-route median (~5.4 km); 10–20 km would be a good feasibility outcome.

## Two unresolved freeze fields
The source protocol does not define:
1. the complete candidate universe from which the 30 route pairs are deterministically selected;
2. the evaluation cutoff date/time.

### Proposed resolution (NOT FROZEN YET)
- Evaluation cutoff: 2026-09-28 23:59:59 UTC.
- Candidate universe: all direct European flight-number/origin/destination route pairs operated by the four named carriers with at least 9 completed occurrences in the 45 days ending at the cutoff.
- Canonical selection key: `carrier|flight_number|origin|destination`.
- Deterministic order: ascending SHA-256 of canonical selection key.
- Sector strata: 15 short (<2h scheduled block time) and 15 medium (2–4h scheduled block time), taking the lowest hashes within each stratum.
- If a stratum contains fewer than 15 eligible pairs, stop and report rather than relaxing the rule after seeing data.

## Isolation
This experiment must use a separate endpoint/data path. Do not modify the frozen US registrar, worker selection rules, US scoring logic, or US campaign rows.

## Interpretation
This is a feasibility probe only. A positive result triggers a proper frozen study with sealed holdout. A negative result closes the historical-track route hypothesis under this method.
