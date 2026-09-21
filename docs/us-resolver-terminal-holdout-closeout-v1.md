# U.S. resolver + terminal holdout closeout v1

Closed: 2026-09-21
Final pre-holdout freeze: `85c0e2942af3741ff6370c76335293ed57aec254`

No rule changes were made after this freeze and before either holdout was opened.

## Development freeze state
- U.S. resolver development replay: 100/100 filed cores valid; 0 ambiguous identifiers; 0 genuinely unresolved.
- Departure frozen rule: predeparture history-first runway branch with AeroAPI fallback.
- Arrival frozen rule: 2-hour destination-arrival persistence using only candidates with `actual_on < captured_at`; scheduled/estimated times never qualify; frozen-v2 direction inference; no duration-specific tuning.

## Sealed normal U.S. holdout — opened once
Population: `US_HOLDOUT_100_260903_V1`, n=100.
Collection errors: 0.

Resolver:
- Filed-core valid: 100/100 = 100%.
- Fully terminal-determined by filed route alone: 2/100. Remaining terminal uncertainty is handled by the frozen chooser/fan rule, not treated as filed-core failure.

Departure terminal:
- Evaluable denominator: 93.
- History branch used: 60.
- AeroAPI fallback used: 33.
- Correct: 66.
- Wrong: 27.
- Accuracy / overall correct on evaluable population: 66/93 = 71.0%.
- Wrong-answer rate: 29.0%.

Arrival persistence:
- Answered: 74/100.
- Refused: 26/100.
- Correct: 63.
- Wrong: 11.
- Coverage: 74%.
- Conditional accuracy: 63/74 = 85.1%.
- Overall correct: 63%.
- Wrong-answer rate: 11%.

One-shot score workflow:
- run `35655472784`
- artifact `us-holdout-100-open-once-score`

## Sealed >4h holdout — opened once
Population: `LONG_HOLDOUT_100_V0`, n=100.
Collection errors: 0.

Arrival persistence:
- Answered: 81/100.
- Refused: 19/100.
- Correct: 62.
- Wrong: 19.
- Coverage: 81%.
- Conditional accuracy: 62/81 = 76.5%.
- Overall correct: 62%.
- Wrong-answer rate: 19%.

One-shot score workflow:
- run `35655802990`
- artifact `long-holdout-100-open-once-score`

## Interpretation
- The independent FAA resolver generalized on filed-core coverage: 100/100 in development and 100/100 in the normal U.S. sealed holdout.
- Normal-flight arrival persistence generalized with 85.1% conditional accuracy at 74% coverage.
- The same predeparture flow signal remains present on genuinely long flights, but performance is lower: 76.5% conditional accuracy at 81% coverage, with a 19% wrong-answer rate.
- Departure terminal selection produced 66/93 correct on its sealed evaluable population. This is the frozen hybrid's holdout result; it is not an AeroAPI-vs-AevPath head-to-head claim unless a same-population holdout AeroAPI comparator is separately scored under the pre-frozen benchmark.

## Seal status
Both holdouts have now been opened once and are permanently development-ineligible. Do not tune rules against them or re-present them as untouched holdouts.

## Production cleanup
The temporary token-gated holdout collector was removed from `main` after capture, and the temporary runtime dependencies were restored to the pre-run package state. Final cleanup deployment reached READY.
