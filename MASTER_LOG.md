# AevPath master delivery log

## 2026-11-02 — Chester recovery / Friday 6 November target
Status: **RED — checker v1.1 PASS not obtained**. Do not merge or claim delivery without end-to-end proof.

Evidence:
- Chester's accepted reference: Gmail attachment `AevPath_handmade_package_23Oct_v3_ready.json`, package_version `handmade-20261016-v3`, 176 timeline points; Austen's 16 Oct message confirms checker GOOD for handmade v3, not for generated packages.
- Reference profile: 318-minute filed airborne duration, 4072.154-km route, takeoff modeled 290 km/h, climb reaching 860 km/h around 22.95 minutes, cruise until 291.2 minutes, descent to 250 km/h at landing. These values are **derived/modelled**, not observed live speeds. The source artifact does not disclose the original generator's formula.
- Branch `fix/chester-gate-departure-20261102`, PR #4: separate `estimated_out` from `estimated_off`; derive predeparture `check_again_after` from latest available gate estimate minus 30 minutes; guard missing ETE; add `api/filed-timeline.js` profile modelling speed and phases from filed route/distance/time; connect model to draft package; add schema v1 adapter.
- Latest commits: `0c092e2a5cb615785592bd6f6fdf985a9b0c49dc` (timeline), `96c30cf88268b35b6625734ade0ffb4790228e87` (adapter).
- Frozen corridor ±18 km; landing windows ±9 airborne and ±17 predeparture. Do not change calibration.
- Outstanding: compare adapter against exact reference shape and checker v1.1, integrate adapter into actual live endpoint, obtain real provider-backed package without unlicensed API usage, run checker, record output, then consider merge/deploy. Modelled speeds are labelled derived, not measured.

### Recovery dates
- **Tue 3 Nov:** validate model against reference timeline; close schema differences; unit/regression tests.
- **Wed 4 Nov:** integrate generator endpoint, run first genuine system-generated package through checker v1.1 **target**. If checker unavailable or PASS not evidenced, escalate RED by evening (18:00 UK) to warn Austen.
- **Thu 5 Nov:** address checker failures, rerun with recorded evidence, verify expiry/gate-delay cases and deployment readiness.
- **Fri 6 Nov:** deliver only after verified checker PASS and endpoint smoke tests; otherwise report blockers and revised ETA, never represent handmade PASS as generated PASS.

### Reporting
Daily one-line evidence-based update scheduled 3–6 Nov around 19:00 UK; separate risk alert Wed 4 Nov around 18:00 UK. These automations report state; they do not themselves constitute a checker run.

## 2026-11-02 — Deadline accelerated by owner
**New required target: Tue 3 Nov, no later than Wed 4 Nov 2026** for system-generated Chester checker v1.1 PASS and deliverable endpoint. Friday 6 Nov is no longer an acceptable completion target. Prioritize live endpoint integration, genuine permitted source data, checker evidence, deployment smoke test. Escalate immediately on any blocker; do not infer PASS. As of this entry, no verified checker PASS exists and accelerated deadline is at risk.
