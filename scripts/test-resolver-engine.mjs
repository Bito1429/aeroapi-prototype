import assert from "node:assert/strict";
import{classifyToken,tokenizeRoute,resolverEnvelope,selectEffectiveCycle,canResolveTokenToObject,compareCommonNamedFixes,RESOLVER_COMPARISON_POLICY}from"../api/resolver-lib.js";

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


assert.equal(RESOLVER_COMPARISON_POLICY.point_tolerance_nm,1);
assert.equal(RESOLVER_COMPARISON_POLICY.procedure_authority,"FAA_CIFP");
assert.equal(RESOLVER_COMPARISON_POLICY.airac_fallback,"NONE");

const cycles=[
  {cycle_code:"2608",effective_from:"2026-08-06T00:00:00Z",effective_to:"2026-09-03T00:00:00Z"},
  {cycle_code:"2609",effective_from:"2026-09-03T00:00:00Z",effective_to:"2026-10-01T00:00:00Z"}
];
assert.equal(selectEffectiveCycle("2026-08-20T12:00:00Z",cycles)?.cycle_code,"2608");
assert.equal(selectEffectiveCycle("2026-09-20T12:00:00Z",cycles)?.cycle_code,"2609");
assert.equal(selectEffectiveCycle("2026-11-01T00:00:00Z",cycles),null);

assert.equal(canResolveTokenToObject("AIRWAY","AIRPORT"),false);
assert.equal(canResolveTokenToObject("AIRWAY","WAYPOINT"),false);
assert.equal(canResolveTokenToObject("POINT_CANDIDATE","VOR",{routeJurisdiction:"MX",objectJurisdiction:"US",loadedJurisdictions:["US"]}),false);

// Defining international collision cases: U.S.-only pack must fail closed.
for(const token of ["UT11","UT34"]){
  assert.equal(classifyToken(token),"AIRWAY");
  assert.equal(canResolveTokenToObject(classifyToken(token),"AIRPORT",{routeJurisdiction:"MX",objectJurisdiction:"US",loadedJurisdictions:["US"]}),false);
}
assert.equal(canResolveTokenToObject(classifyToken("VER"),"VOR",{routeJurisdiction:"MX",objectJurisdiction:"US",loadedJurisdictions:["US"]}),false);

const cmp=compareCommonNamedFixes(
  [{name:"AAA",latitude:40,longitude:-75},{name:"BBB",latitude:41,longitude:-76}],
  [{name:"AAA",latitude:40.005,longitude:-75},{name:"BBB",latitude:41.005,longitude:-76}]
);
assert.equal(cmp.common_count,2);
assert.equal(cmp.agreement,true);
