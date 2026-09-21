import assert from "node:assert/strict";
import{classifyToken,tokenizeRoute,resolverEnvelope}from"../api/resolver-lib.js";

assert.equal(classifyToken("UT11"),"AIRWAY");
assert.equal(classifyToken("J70"),"AIRWAY");
assert.equal(classifyToken("L455"),"AIRWAY");
assert.equal(classifyToken("CANUC7"),"PROCEDURE_CANDIDATE");
assert.equal(classifyToken("AGLIN"),"POINT_CANDIDATE");

const t=tokenizeRoute("MXL3B MXL UJ7 PPE UT11 RUDLO");
assert.equal(t.length,6);
assert.equal(t[4].token_class,"AIRWAY");

const r=resolverEnvelope({route:"PPE UT11 RUDLO",origin:"MMMY",destination:"MMUN",nav_cycle_code:"TEST"});
assert.equal(r.status,"PARTIAL");
assert.deepEqual(r.unresolved_tokens,["PPE","UT11","RUDLO"]);
assert.equal(r.tokens[1].reason_code,"NAVDATA_NOT_LOADED");

console.log("resolver engine v0 tests: PASS");
