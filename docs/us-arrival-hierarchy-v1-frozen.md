# U.S. arrival hierarchy v1 — frozen before holdout

Frozen: 2026-09-21
Development only. Neither sealed holdout was inspected in choosing this rule.

## Eligibility and anti-leak rule
For an evaluated flight with package cutoff `captured_at`:
- Consider destination-airport arrivals only if `actual_on < captured_at`.
- Scheduled or estimated arrival times never qualify an arrival.
- Missing or ambiguous `actual_on` => exclude that candidate.
- Search the 2-hour interval immediately before `captured_at`.
- Sort qualifying arrivals by `actual_on` descending.

## Direction inference
- Starting with the most recent qualifying arrival, use its historical track.
- Infer landing-direction family with the frozen v2 geometry rule.
- Track data used for inference must not include points after that arrival's touchdown.
- If the most recent qualifying arrival cannot yield a valid v2 direction, continue to the next qualifying arrival in time order.
- If no qualifying arrival yields a valid direction, REFUSE.

## Prediction
- Predict the direction family of the first qualifying arrival that produces a valid frozen-v2 inference.
- Ignore exact L/R/C runway suffix for scoring; family match is circular alignment difference <=10 degrees.
- No airport-specific tuning.
- No scheduled/estimated-time fallback.
- No modal-14d fallback.
- No 3h/4h fallback.
- No flight-duration switch. The identical 2-hour rule is used for <=4h and >4h flights.

## Development evidence used to freeze this rule
Normal U.S. development 100:
- Original stored-archive persistence: 43/100 answered, 42/43 correct.
- Historical AeroAPI backfill of the 57 original refusals under actual-on-before-captured-at: 38 additional valid v2 predictions, 31 correct, 7 wrong.
- Combined: 81/100 answered, 73 correct, 8 wrong; 90.1% conditional accuracy, 81% coverage.

Long-flight development 100 (>240 scheduled minutes):
- 88/100 had a qualifying pre-cutoff arrival.
- 87/100 produced a valid persistence prediction.
- 70/87 correct, 17 wrong; 80.5% conditional accuracy, 87% coverage.

## Frozen interpretation
Persistence is useful predeparture signal across both ordinary and >4-hour U.S. flights, but the long-flight evidence shows lower conditional accuracy. The rule therefore remains simple and identical across duration; no duration-specific tuning is introduced from development results.

## Holdout rule
Do not modify this hierarchy after either sealed holdout is opened.
