# Arrival direction baseline evaluation policy v0 — frozen before results

Frozen: 2026-09-21
Development population only: US_SHADOW_100_260903_V1.
US_HOLDOUT_100_260903_V1 remains sealed.

Ground-truth direction for evaluation:
- Historical completed-track label produced by landing-direction inference policy v2.
- This is a direction-family label, not exact parallel-runway identity.

Direction-family MATCH:
- A predicted family matches the historical label when the circular angular difference between predicted family alignment and historical family alignment is <= 10 degrees.
- Exact L/R/C runway identity is ignored.
- Opposite runway direction on the same pavement is a mismatch.

Stored-label validation:
- Where raw_capture.flight.actual_runway_on is available for a completed development flight, map that runway end to FAA TRUE_ALIGNMENT for the flight's effective AIRAC.
- Compare the stored-runway alignment with v2 inferred family alignment.
- Agreement = circular angular difference <=10 degrees.
- Report n, agreement count/rate, and disagreements. This validation may not change thresholds.

Preflight baselines:
A. MODAL-14D
- For evaluated flight at predeparture capture time T, use only distinct completed arrivals at that destination whose completion/track capture time is < T and >= T-14 days.
- Infer each prior arrival's landing-direction family using frozen v2.
- Require >=5 valid prior inferred arrivals.
- Choose the unique modal direction family (families equivalent when alignment difference <=10 degrees).
- Tie => REFUSE.

B. PERSISTENCE-2H
- For evaluated flight at predeparture capture time T, use only completed arrivals at that destination with completion/track capture time < T and >= T-2 hours.
- Choose the direction family of the single most recent valid inferred arrival.
- No prior valid inferred arrival within 2 hours => REFUSE.
- No majority/tuning is applied; this tests pure flow persistence.

Metrics (each baseline):
- coverage = answered / 100;
- conditional accuracy = matched / answered;
- overall correct rate = matched / 100;
- refusal rate = refused / 100;
- wrong-answer rate = mismatched / 100.

Comparison:
- MODAL-14D and PERSISTENCE-2H are descriptive development baselines.
- Neither may be promoted to holdout/production based on development results alone.
- A later combined rule requires its own frozen definition before holdout use.
