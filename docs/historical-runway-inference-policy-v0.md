# Historical runway inference policy v0 — frozen before results

Frozen: 2026-09-21

Purpose:
Infer the runway actually used by a completed historical flight from its postflight track, for use only as prior runway-frequency evidence for later flights.

No-hindsight boundary:
- For an evaluated flight at time T, only inferred runway uses from flights completed before T may enter the historical runway-frequency baseline.
- The evaluated flight's own track is used only to score the eventual runway choice, never to choose it.

FAA geometry:
- Runway-end positions and TRUE_ALIGNMENT come from the AIRAC cycle effective for the historical flight.
- Candidate runways are limited to runway ends at that flight's destination airport.

Arrival inference:
- Use the final valid postflight track point and the final track segment whose endpoints are at least 0.5 NM apart.
- Candidate runway end must satisfy ALL:
  1. final valid track point is within 3.0 NM of the FAA runway-end threshold;
  2. angular difference between final-track inbound bearing and runway TRUE_ALIGNMENT is <= 20 degrees;
  3. projected along-track direction is toward the selected runway end, not away from it.
- Choose the candidate with the lowest composite cost:
    threshold_distance_nm + heading_error_deg / 20.
- Confidence/refusal:
  - If no candidate passes all gates => CANNOT_TELL.
  - If the best and second-best passing candidates have composite costs within 0.25 => CANNOT_TELL.
  - Otherwise infer the best runway end.

Departure inference:
- Symmetric rule may be evaluated later using the first valid track segment and runway-end geometry, but it is not needed for the current stored-field departure dumb baseline.

Validation:
- Where a stored actual_runway_on field exists, inferred arrival runway may be compared against it descriptively.
- This comparison cannot be used to change the frozen thresholds above.

Historical most-used-runway baseline:
- Requires >=5 prior distinct completed flights with a non-CANNOT_TELL inferred runway at the airport.
- Requires a unique modal runway.
- Otherwise REFUSE.
