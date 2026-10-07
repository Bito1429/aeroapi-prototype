# Corridor calibration v1 — frozen 7 Oct 2026

Purpose: provide a statistically calibrated route-confidence corridor for the package endpoint without conflating it with any separate visual/product corridor.

## Method frozen before reading calibration outputs

Population: checkpoint cross-track scores from closed, scoreable US flights dated 8 Sep–2 Oct 2026.

Chronological split:
- calibration: 8 Sep–22 Sep 2026
- validation: 23 Sep–2 Oct 2026

Rule:
- target = ~80% of checkpoint cross-track errors inside the corridor
- corridor half-width = calibration-set 80th percentile cross-track error, rounded upward to a whole kilometre
- no Europe data or sealed holdouts are used

Frozen v1 confidence half-width:
- ±18 km

Calibration:
- 18,930 checkpoint scores
- p80 = 17.9942 km

Out-of-sample validation:
- 31,075 checkpoint scores
- 84.21% within ±18 km

Important: this is the statistical confidence corridor. It is deliberately kept separate from any narrower visual/display corridor that product design may use. No display width is frozen here.
