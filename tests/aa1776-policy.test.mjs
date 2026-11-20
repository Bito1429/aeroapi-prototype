import test from"node:test";
import assert from"node:assert/strict";
import{AA1776_DATES,inCollectionWindow,selectAA1776,saleDecision,routeValid,LOOKUP_RESERVATION_MILLS,ROUTE_RESERVATION_MILLS,MAX_DAILY_RESERVED_MILLS}from"../api/aa1776-policy.js";
const f=(date="2026-11-26",override={})=>({
 ident:"AAL1776",ident_icao:"AAL1776",fa_flight_id:"test-id",
 origin:{code_icao:"KPHL"},destination:{code_icao:"KBOS"},
 scheduled_out:date+"T21:25:00Z",status:"Scheduled",...override
});
test("only two permitted days",()=>assert.deepEqual(AA1776_DATES,["2026-11-24","2026-11-26"]));
test("Tuesday collection permitted only within day-specific UTC window",()=>{
 assert.equal(inCollectionWindow("2026-11-24","2026-11-24T20:00:00Z"),true);
 assert.equal(inCollectionWindow("2026-11-24","2026-11-24T20:30:00Z"),false);
 assert.equal(inCollectionWindow("2026-11-23","2026-11-23T20:00:00Z"),false);
});
test("Thursday route retries stop at 19:30 UTC",()=>{
 assert.equal(inCollectionWindow("2026-11-26","2026-11-26T15:00:00Z"),true);
 assert.equal(inCollectionWindow("2026-11-26","2026-11-26T19:30:00Z"),true);
 assert.equal(inCollectionWindow("2026-11-26","2026-11-26T19:30:01Z"),false);
});
test("exact AA1776 PHL-BOS date only",()=>{
 assert.equal(selectAA1776([f()], "2026-11-26").ok,true);
 assert.equal(selectAA1776([f("2026-11-24")], "2026-11-26").ok,false);
 assert.equal(selectAA1776([f("2026-11-26",{destination:{code_icao:"KJFK"}})],"2026-11-26").ok,false);
 assert.equal(selectAA1776([f(),f()],"2026-11-26").error,"AMBIGUOUS_FLIGHT");
 assert.equal(selectAA1776([f("2026-11-26",{scheduled_out:"2026-11-26T16:00:00Z"})],"2026-11-26").error,"UNEXPECTED_DEPARTURE_TIME");
});
test("departed or cancelled never sellable, including scheduled time past",()=>{
 assert.equal(saleDecision(f(), "2026-11-26T20:00:00Z"),"CHECK_ROUTE");
 assert.equal(saleDecision(f("2026-11-26",{actual_out:"2026-11-26T20:59:00Z"}),"2026-11-26T21:00:00Z"),"DEPARTED");
 assert.equal(saleDecision(f("2026-11-26",{status:"En Route"}),"2026-11-26T20:00:00Z"),"DEPARTED");
 assert.equal(saleDecision(f(),"2026-11-26T21:26:00Z"),"DEPARTED");
 assert.equal(saleDecision(f("2026-11-26",{estimated_out:"2026-11-26T22:00:00Z"}),"2026-11-26T21:26:00Z"),"CHECK_ROUTE");
 assert.equal(saleDecision(f("2026-11-26",{status:"Cancelled"}),"2026-11-26T20:00:00Z"),"CANCELLED");
});
test("no placeholder, zero-distance or invalid filed routes accepted",()=>{
 assert.equal(routeValid({baseline_valid:true,canonical_route:"A-B",computed_km:300,fixes:[{latitude:40,longitude:-75},{latitude:42,longitude:-71}]}),true);
 assert.equal(routeValid({baseline_valid:true,canonical_route:"A-B",computed_km:0,fixes:[{latitude:40,longitude:-75},{latitude:42,longitude:-71}]}),false);
 assert.equal(routeValid({baseline_valid:true,canonical_route:"A-B",computed_km:300,fixes:[{latitude:40,longitude:-75},{latitude:null,longitude:-71}]}),false);
});
test("budget allowance stays within 2 dollars and over-reserves published rates",()=>{
 assert.equal(MAX_DAILY_RESERVED_MILLS,2000);
 assert.ok(LOOKUP_RESERVATION_MILLS>=5);
 assert.ok(ROUTE_RESERVATION_MILLS>=10);
});
