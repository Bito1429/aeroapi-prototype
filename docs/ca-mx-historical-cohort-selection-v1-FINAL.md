# Canada + Mexico historical cohort selection v1 — FINAL freeze before AeroAPI retrieval

Frozen: 2026-09-21.
Supersedes v0 before any Canada/Mexico AeroAPI candidate retrieval occurred.

Fixed first-pass retrieval window:
- 2026-09-20T00:00:00Z through 2026-09-20T23:59:59Z.

Canada candidate endpoints:
- at least one airport ICAO beginning with C.

Mexico candidate endpoints:
- at least one airport ICAO beginning with MM.

Population/split rules are exactly those in docs/ca-mx-resolver-validation-policy-v0.md.

Retrieval strategy:
- enumerate completed arrivals and departures at every airport in the predeclared list;
- deduplicate globally by fa_flight_id;
- retain only metadata-only eligible flights;
- compute SHA-256 of fa_flight_id and sort ascending;
- odd eligible rank -> development pool; even eligible rank -> sealed holdout pool;
- take first 100 unique flights from each pool;
- freeze DEVELOPMENT_100 and HOLDOUT_100 simultaneously before any target track, actual runway, route-decoder geometry, resolver outcome or terminal-flow outcome is fetched.

Predeclared airport enumeration list:

Canada:
CYYZ, CYVR, CYUL, CYYC, CYEG, CYOW, CYWG, CYHZ, CYQB, CYYJ.

Mexico:
MMMX, MMUN, MMMY, MMGL, MMTJ, MMSD, MMSM, MMPR, MMSL, MMCZ.

Airport order is enumeration-only and must not affect membership after global deduplication and hash sorting.

If a country produces fewer than 200 eligible unique flights on 2026-09-20:
- rerun from scratch over 2026-09-19T00:00:00Z through 2026-09-20T23:59:59Z;
- preserve every other rule.
