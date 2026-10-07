# Package endpoint pre-launch checklist

This checklist is for AevPath's package endpoint work before the January 2027 US release.

- Map the implementation to Chester Apps schema v1 and pass the published conformance suite.
- Keep passenger-facing timing terminology as landing/touchdown, not gate arrival.
- Verify 202 PENDING_ROUTE, sale states, latest estimated_off, ETag/304 and resolver-sanity fields against Chester's expected types.
- Verify timeline spacing remains <=2 minutes and <=25 km after schema mapping.
- Preserve ETA calibration v1: predeparture landing window +/-17 min; airborne landing window +/-9 min; do not retune on the 23 Sep-2 Oct validation period.
- Preserve route-confidence corridor v1 at +/-18 km statistical half-width; keep it separate from any display corridor.
- Treat the 7 Oct-Nov campaign as the first genuinely prospective check of the frozen +/-18 km corridor.
- eta_prediction_audit table and indexes are live in Neon as of 7 Oct 2026.
- Before release, prove runtime ETA persistence end-to-end: generate packages, verify audit rows are written with cutoff, version, predicted touchdown window and baseline-at-cutoff, then verify final_actual_on is populated after flight completion.
- Confirm the audit survives repeated package refreshes without duplicate rows for the same flight/version/cutoff.
- Verify deployed package endpoint with a real Neon-backed preview/staging environment or production-safe test before declaring it complete.
- Do not merge the pre-schema branch to production until Chester schema mapping and conformance checks are green.
