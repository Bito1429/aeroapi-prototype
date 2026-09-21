# U.S. resolver + terminal rule v1 — FINAL FREEZE before sealed holdouts

Frozen: 2026-09-21.
This file is the information barrier. Neither US_HOLDOUT_100_260903_V1 nor LONG_HOLDOUT_100_V0 was inspected for outcomes in choosing these rules.

## 1. Main-route resolver
Authoritative sources and cycle:
- FAA NASR FIX/NAV/AWY/APT for the effective AIRAC cycle.
- FAA CIFP for SID/STAR procedure coding.
- For the current frozen evaluation cycle: 260903.

Resolver behavior:
- Exclude FAA VOT test facilities from route-navaid resolution.
- Resolve bare route navaids from operational NASR route objects; ambiguity fails closed.
- Expand airways only when entry and exit identify one authoritative airway path.
- CIFP procedure parser accepts the parallel FAA route-type families 1/2/3 and 4/5/6 for transition/common/runway branches.
- Runway-dependent SID/STAR variation is terminal ambiguity, not a filed-core resolver failure.
- Main-route filed core never selects among ambiguous runway branches by inspection.
- Unsupported/unresolved filed-core objects => REFUSE.

Development regression after these fixes:
- Population: US_SHADOW_100_260903_V1, n=100.
- Deterministic full route: 1.
- Deterministic filed core with terminal ambiguity: 99.
- Genuinely unresolved: 0.
- Ambiguous identifiers: 0.
Therefore filed-core resolution = 100/100 on the development set.

Frozen implementation commits:
- VOT exclusion / navaid collision fix: c4fa3f0e62730eca1f2c16757b981b0ff597318b
- CIFP parallel transition families: 6837f5eef18ab64f1e83ff2a838fb4b63c468817
- Runway-dependent procedure ambiguity handling: e40a34559897c53d2167a5a7f6ca5bb76ced1464
- Filed-core treatment of SID terminal ambiguity: d9fb9841c41fd2b840ac39487926ba80fc7354d3

## 2. Departure terminal rule
Population/rule already frozen before holdout:
1. Estimate most-used departure runway using only completed runway observations available before the evaluated flight's predeparture cutoff.
2. Require at least 5 distinct prior completed flights and a unique modal runway; otherwise history REFUSES.
3. If the history rule answers and the filed SID can be uniquely expanded for that runway + filed next fix, use that branch.
4. Otherwise fall back to the predeparture AeroAPI terminal branch.
5. Never use postdeparture/future runway evidence to choose a branch.

Development evidence on 95 evaluable departures:
- History-only: 60 answered, 47 correct, 13 wrong; 78.3% conditional accuracy.
- AeroAPI reference: 67/95 correct.
- Frozen history-first / AeroAPI-fallback hybrid: 74/95 correct, 21 wrong; 77.9% overall correct, 22.1% wrong-answer rate.

## 3. Arrival terminal rule
Use docs/us-arrival-hierarchy-v1-frozen.md without modification:
- destination arrivals only;
- actual_on < captured_at is mandatory;
- scheduled/estimated arrival never qualifies;
- 2-hour lookback;
- newest qualifying arrival whose track yields valid frozen-v2 direction;
- no 3h/4h, modal-14d, airport tuning or duration-specific fallback;
- if none yields a valid direction => REFUSE.

For rendering:
- The resolver supplies the deterministic filed core.
- When arrival direction answers, display the most likely direction-consistent terminal geometry if unique.
- If multiple CIFP branches remain consistent with the predicted direction, show the non-committal terminal fan; do not silently choose an exact runway branch.
- When arrival direction refuses, show the deterministic filed core + fan only.

Development evidence:
- Normal U.S. development combined after historical backfill: 81/100 answered, 73 correct, 8 wrong; 90.1% conditional accuracy.
- Long-flight development (>240 min): 87/100 answered, 70 correct, 17 wrong; 80.5% conditional accuracy.

## 4. Holdout execution
After this commit:
1. Open US_HOLDOUT_100_260903_V1 once and report resolver filed-core coverage, departure terminal results where evaluable, and arrival-direction persistence under the frozen rules.
2. Open LONG_HOLDOUT_100_V0 once and report arrival-direction persistence under the identical frozen rule.
3. Do not tune, patch or re-score either holdout after seeing its results. Any future changes require a new version and a new untouched holdout.
