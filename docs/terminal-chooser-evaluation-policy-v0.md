# Terminal chooser evaluation policy v0 — frozen before terminal chooser development

Frozen: 2026-09-21

Population:
- Development: US_SHADOW_100_260903_V1.
- Holdout: US_HOLDOUT_100_260903_V1 remains sealed until terminal chooser rules are frozen.
- Departure and arrival are evaluated separately.
- Only flights with an evaluable terminal branch under the already-frozen track benchmark enter that side's denominator.

Metrics:
1. Coverage = answered branches / evaluable branches.
2. Conditional accuracy = MATCH answers / answered branches.
3. Overall correct rate = MATCH answers / evaluable branches.
4. Refusal rate = refused branches / evaluable branches.
5. Wrong-answer rate = NO_MATCH answers / evaluable branches.

Primary comparison against AeroAPI:
- AevPath BEATS AeroAPI on a side only if BOTH:
  a) overall correct rate is strictly greater than AeroAPI's overall correct rate on the same evaluable population; and
  b) wrong-answer rate is no greater than AeroAPI's wrong-answer rate on that same population.
- A system that improves conditional accuracy by refusing heavily does not count as beating AeroAPI unless condition (a) is also met.
- Coverage and conditional accuracy are always reported alongside the primary comparison.

Secondary safety comparison:
- AevPath may be called SAFER if wrong-answer rate is lower than AeroAPI's, even if overall correct rate is also lower because of refusals.
- SAFER is not the same as BEATS.

Track match rule:
- Unchanged from aeroapi-terminal-branch-benchmark-v0.md:
  >=75% of branch fixes within 3 NM AND median branch-fix distance <=3 NM.
- 5 NM is sensitivity only.

Dumb baseline:
- "Most-used runway" must be estimated only from runway observations available before the evaluated flight's departure time.
- No future runway observations from the evaluated flight or later flights may enter the runway-frequency estimate.
- Historical runway evidence must contain at least 5 distinct prior completed flights at that airport for that side (departure/arrival).
- The modal runway must be unique. Fewer than 5 observations or a tie for modal runway => REFUSE.
- The selected runway branch is then evaluated against the same flown-track benchmark.
- Report coverage, conditional accuracy, overall correct rate, refusal rate and wrong-answer rate identically.

Product display:
- A single runway-specific path may only be shown when the terminal chooser answers.
- On REFUSE / multi-branch ambiguity, the product may show the deterministic main route plus a non-committal terminal fan; it must not silently choose one branch.
