# Canada + Mexico historical cohort selection v0 — frozen before AeroAPI retrieval

Frozen: 2026-09-21.

Fixed first-pass retrieval window:
- 2026-09-01T00:00:00Z through 2026-09-20T23:59:59Z.

Canada candidate endpoints:
- at least one airport ICAO beginning with C.

Mexico candidate endpoints:
- at least one airport ICAO beginning with MM.

Population/split rules are exactly those in docs/ca-mx-resolver-validation-policy-v0.md.

Retrieval strategy:
- enumerate completed arrivals/departures at a predetermined airport list chosen by traffic relevance, not by resolver success;
- deduplicate globally by fa_flight_id;
- keep only flights satisfying the frozen metadata-only eligibility rule;
- compute deterministic SHA-256 split;
- freeze DEVELOPMENT_100 and HOLDOUT_100 simultaneously for each country before any target track, runway or route-decoder geometry is fetched.

Predeclared airport enumeration list:

Canada:
CYYZ, CYVR, CYUL, CYYC, CYEG, CYOW, CYWG, CYHZ, CYQB, CYYJ.

Mexico:
MMMX, MMUN, MMMY, MMGL, MMTJ, MMSD, MMSM, MMPR, MMSL, MMCZ.

Airport order is only an enumeration order and must not affect membership after global deduplication and hash sorting.

If a country produces fewer than 200 eligible flights:
- extend window backward to 2026-08-01T00:00:00Z, preserving every other rule.
