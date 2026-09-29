# Europe historical-route feasibility — V1 FROZEN

Status: FROZEN 2026-09-29. No sampling, method, metric or threshold changes after data inspection.

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
- Candidate universe: all qualifying direct European route pairs with at least 9 completed occurrences in the 45 days ending at the cutoff.
- Evaluation cutoff: 2026-09-28 23:59:59 UTC.
- All 9 qualifying occurrences for a selected route must have completed before the cutoff.
- For each selected route, order the 9 qualifying occurrences chronologically: the earliest 6 are training and the latest 3 are evaluation. No post-cutoff occurrence may enter either set.
- 30 distinct route pairs are selected deterministically.
- Canonical selection order: ascending SHA-256 of `carrier|flight_number|origin|destination`.
- Sector class is fixed using median scheduled block time across the 9 qualifying occurrences, where scheduled block time = scheduled_in - scheduled_out.
- Short sector: median scheduled block time <2h.
- Medium sector: median scheduled block time >=2h and <=4h.
- Select 15 short and 15 medium route pairs by lowest hash within each stratum.
- If either stratum has fewer than 15 eligible route pairs, stop and report rather than relaxing the rule after seeing data.

## Frozen prediction rules
- Primary method: median path.
- For each of the 6 training tracks, resample to a fixed number of points by fraction of distance flown.
- Take the pointwise median latitude and longitude across the six resampled tracks.
- That median path is the predicted route for each of the 3 evaluation occurrences for the same route pair.
- Secondary methods, reported but not decisive:
  - most recent eligible training track;
  - great-circle origin-to-destination path.
- Leakage rule: only tracks from flights that landed before the evaluated flight's notional package-freeze time may be used. Under this historical split, the 6 training occurrences precede the 3 evaluation occurrences by construction; still verify the timestamp rule for every evaluated flight and exclude any violating case rather than substituting another track post hoc.

## Frozen metrics
- Use the same cross-track measure as the US campaign.
- Report median, mean, p90, share of evaluated flights within 15 km, and share within 50 km.
- Report all three methods separately: median path, most recent track, great circle.

## Frozen success criteria
- Usable: median cross-track <=15 km AND >=70% of evaluated flights within 50 km.
- Marginal: median cross-track >15 km and <=30 km.
- Not usable: median cross-track >30 km OR median-path method is no better than great circle.
- Predeclared expectation: worse than the US filed-route median (~5.4 km); a 10-20 km median would be a good feasibility result.

## Isolation
This experiment must use a separate endpoint/data path. Do not modify the frozen US registrar, worker selection rules, US scoring logic, or US campaign rows.

## Interpretation
This is a feasibility probe only. A positive result triggers a proper frozen study with a sealed holdout. A negative result closes the historical-track route hypothesis under this method.
