# Arrival persistence diagnostic split v0 — frozen before results

Frozen: 2026-09-21
Population: US_SHADOW_100_260903_V1 development set only. Holdout remains sealed.

Timing anchor:
- Persistence lookback is anchored to the predeparture baseline/package capture timestamp (captured_at), never landing time.
- Only historical arrivals whose track_captured_at < evaluated captured_at are eligible.

Flight-length split:
- scheduled gate-to-gate duration = scheduled_on_initial - scheduled_out_initial.
- SHORT: <=120 minutes.
- MEDIUM: >120 and <=240 minutes.
- LONG: >240 minutes.
- Report persistence coverage, conditional accuracy, overall correct rate, refusal rate, and wrong-answer rate per bin.

Refusal diagnosis for PERSISTENCE-2H:
- NO_ARRIVAL_2H: no completed historical arrival at destination in prior 2 hours.
- ARRIVALS_BUT_NO_VALID_DIRECTION: one or more arrivals existed in prior 2 hours but none yielded a valid frozen v2 direction label.
- Report refusal counts by destination and by reason.
- Do not alter the 2-hour window from this diagnostic.
