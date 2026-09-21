# Arrival persistence window comparison v0 — frozen before results

Frozen: 2026-09-21
Population: US_SHADOW_100_260903_V1 development set only.
US_HOLDOUT_100_260903_V1 remains sealed.

Timing:
- Every lookback window is anchored to evaluated predeparture baseline/package captured_at.
- Only historical arrivals with track_captured_at < evaluated captured_at are eligible.
- No landing-time or future information from the evaluated flight may enter prediction.

Candidate windows:
- 2 hours (current reference)
- 3 hours
- 4 hours

Prediction:
- For each window, choose the single most recent historical arrival at the destination that has a valid frozen v2 landing-direction-family label.
- If none exists inside the window => REFUSE.
- No weighting, averaging, airport-specific tuning, or flight-length-conditioned switching is allowed in this test.

Scoring:
- Same frozen direction-family scoring: MATCH if circular alignment difference <=10 degrees.
- Exact L/R/C parallel runway identity is ignored.
- Report for each window:
  coverage,
  conditional accuracy,
  overall correct rate,
  refusal rate,
  wrong-answer rate,
  source-arrival age distribution (median, p75, p90, max).
- Also report by frozen duration bins:
  SHORT <=120 min,
  MEDIUM 121-240 min,
  LONG >240 min.

Interpretation:
- This is a development-set comparison only.
- A longer window is not automatically preferred merely for higher coverage; added wrong-answer rate must be considered.
- No holdout evaluation or production change follows automatically from this test.
