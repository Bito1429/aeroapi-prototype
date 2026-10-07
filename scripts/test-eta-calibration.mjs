import assert from "node:assert/strict";
import{ETA_CALIBRATION,etaPackage}from"../api/eta-calibration.js";

assert.equal(ETA_CALIBRATION.predeparture.half_width_minutes,17);
assert.equal(ETA_CALIBRATION.airborne.half_width_minutes,9);

const x=etaPackage({estimatedOff:"2026-10-07T12:00:00Z",filedEteSeconds:7200});
assert.equal(x.semantics,"LANDING_NOT_GATE_ARRIVAL");
assert.equal(x.predeparture.landing_time_center,"2026-10-07T14:00:00.000Z");
assert.equal(x.predeparture.landing_window.early,"2026-10-07T13:43:00.000Z");
assert.equal(x.predeparture.landing_window.late,"2026-10-07T14:17:00.000Z");
assert.equal(x.airborne.center_rule,"detected_takeoff_plus_filed_ete");
assert.equal(x.airborne.relative_to_detected_takeoff.landing_center_offset_seconds,7200);
assert.equal(x.airborne.relative_to_detected_takeoff.landing_early_offset_seconds,6660);
assert.equal(x.airborne.relative_to_detected_takeoff.landing_late_offset_seconds,7740);

console.log(JSON.stringify({ok:true,version:ETA_CALIBRATION.version,pre:x.predeparture,airborne:x.airborne}));
