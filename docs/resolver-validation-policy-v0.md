# Resolver Validation Policy v0 — frozen before first reconstruction

Frozen: 2026-09-21
Applies to: R2_ENGINE_V0_2026-09-21 and the first independent U.S. resolver reconstruction.

## 1. AIRAC selection
- Every resolver run MUST be pinned to the AIRAC/navdata cycle effective on the flight date/time.
- No "latest available", nearest-cycle, or forward fallback is allowed.
- If the effective cycle is unavailable, resolution status is INVALID with reason AIRAC_CYCLE_UNAVAILABLE.
- The resolver run records both cycle ID/code and the exact source-pack SHA-256 values.

## 2. U.S. source precedence
- FIX / navaid / airway base data: FAA NASR for the effective cycle.
- SID / STAR / procedure leg coding: FAA CIFP is authoritative.
- NASR DP/STAR material is cross-check evidence only where CIFP is available.
- A NASR/CIFP disagreement is logged as SOURCE_DISAGREEMENT and is never resolved case-by-case by visual preference.

## 3. Collision and unsupported-jurisdiction rule
- A token classified as AIRWAY can never be resolved to a point object.
- With only the U.S. pack loaded, non-U.S. route objects remain UNRESOLVED unless they are explicitly represented in the authoritative U.S. source for that cycle and context.
- Known guard cases:
  - UT11 in Mexican airway position: must never resolve to a Utah airport/object.
  - UT34 in Mexican airway position: must never resolve to a Utah airport/object.
  - VER on a Mexican route: must never resolve to an unrelated U.S. VER object merely by identifier match.
- Ambiguity or unsupported jurisdiction fails closed.

## 4. Resolver-to-resolver comparison
The historical AeroAPI geometry is a comparator, not ground truth.

For common named fixes:
- point agreement tolerance: <= 1.0 NM geodesic distance;
- severe disagreement threshold: > 5.0 NM;
- route-level AGREEMENT requires >= 95% of common named fixes within 1.0 NM;
- route-level AGREEMENT additionally requires zero common named fixes beyond 5.0 NM.
Endpoints must identify the same origin/destination airports.

Differences in expansion count alone do not determine correctness.

## 5. Arbitration by flown track
When the independent resolver and historical AeroAPI geometry disagree:
- neither geometry wins by inspection;
- both are evaluated against the exact same postflight track under the same scoring method;
- lower track error is reported descriptively, together with the difference and sample size;
- the comparison does not retroactively alter the frozen historical headline metrics.

## 6. Provenance
Every imported pack records:
- source URL;
- AIRAC/cycle code;
- effective interval;
- download timestamp;
- SHA-256 of the original downloaded archive/file;
- parser version.

Every resolver run records the exact cycle and source pack references used.
