import assert from "node:assert/strict";
import{CORRIDOR_CALIBRATION,corridorMeta}from"../api/corridor-calibration.js";

assert.equal(CORRIDOR_CALIBRATION.confidence_half_width_km,18);
assert.equal(CORRIDOR_CALIBRATION.display_half_width_km,null);
const m=corridorMeta();
assert.equal(m.target_coverage,0.80);
assert.ok(m.validated_coverage>0.80&&m.validated_coverage<0.90);

console.log(JSON.stringify({ok:true,...m}));
