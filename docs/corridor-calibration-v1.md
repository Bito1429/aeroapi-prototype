# Corridor calibration v1 — frozen 7 Oct 2026

Purpose: provide a statistically calibrated route-confidence corridor for the package endpoint without conflating it with any separate visual/product corridor.

## Provenance and freeze status

The package design already called for a single corridor half-width, but the single-value-vs-per-phase choice was not separately preregistered before an aggregate 8 Sep–2 Oct p80 cross-track query was run. That aggregate query included dates later used as the validation period. Therefore the 23 Sep–2 Oct coverage below is a retrospective holdback check, not a pristine untouched holdout for the design choice.

After that aggregate check, the following rule was frozen before reading the chronological split outputs:
- one global confidence half-width, not per-phase widths
- target ~80% checkpoint cross-track coverage
- half-width = calibration-period p80 cross-track error rounded upward to a whole kilometre
- calibration period 8 Sep–22 Sep 2026
- validation period 23 Sep–2 Oct 2026
- no Europe data or sealed route-pair holdouts

Frozen v1 confidence half-width:
- ±18 km

Calibration:
- 18,930 checkpoint scores
- p80 = 17.9942 km

Retrospective validation-period check:
- 31,075 checkpoint scores
- 84.21% within ±18 km

The continuous campaign beginning 7 Oct is the first genuinely prospective test of the frozen ±18 km rule.

Important: this is the statistical confidence corridor. It is deliberately kept separate from any narrower visual/display corridor that product design may use. No display width is frozen here.
