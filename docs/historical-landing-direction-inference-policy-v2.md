# Historical landing-direction inference policy v2 — frozen before results

Frozen: 2026-09-21
Development population only. US_HOLDOUT_100_260903_V1 remains sealed.

Reason for v2:
The v1 "moving toward runway threshold" gate is invalid for tracks that continue through touchdown and end beyond the threshold on the runway. Development diagnostics showed all 100 track endpoints were within 0.9 NM of a runway threshold (median 0.39 NM), while 75/77 multi-candidate cases were same-direction parallels. Therefore v2 changes only the post-threshold directionality test; distance, heading and ambiguity thresholds are unchanged.

Inputs:
- completed historical postflight track;
- FAA runway-end positions and TRUE_ALIGNMENT from the AIRAC cycle effective for that flight.

Final approach:
- final valid track point;
- final track segment whose endpoints are at least 0.5 NM apart;
- inbound bearing of that segment.

Individual runway-end eligibility:
1. final point <= 3.0 NM from runway threshold;
2. heading difference to runway TRUE_ALIGNMENT <= 20 degrees.
No "moving toward threshold" condition is used because the final track point may be after threshold crossing.

Direction-family merge:
- eligible runway ends whose TRUE_ALIGNMENT values differ by <= 10 degrees are one landing-direction family;
- exact L/R/C runway identity is not inferred from proximity alone;
- family alignment = circular mean;
- family cost = minimum member cost:
    threshold_distance_nm + heading_error_deg / 20.

Decision:
- zero eligible families => CANNOT_TELL;
- one eligible family => INFERRED_DIRECTION;
- multiple families => choose lowest cost only if it beats second-best by >0.25; otherwise CANNOT_TELL.

Historical baseline:
- count direction families, not exact parallel runways;
- >=5 prior distinct completed INFERRED_DIRECTION observations required;
- unique modal direction family required; otherwise REFUSE.

Product:
- inferred family may orient/select a terminal fan;
- it does not justify one exact parallel-runway line.
