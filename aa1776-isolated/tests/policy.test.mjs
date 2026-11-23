import test from "node:test";
import assert from "node:assert/strict";
import {AA1776_DATES,inCollectionWindow,selectAA1776,saleDecision,routeValid,aa1776PackageExpiresAt,MAX_DAILY_RESERVED_MILLS,LOOKUP_RESERVATION_MILLS,ROUTE_RESERVATION_MILLS} from "../lib/aa1776-policy.js";
const flight=(date="2026-11-23",over={})=>({ident_icao:"AAL1776",ident:"AAL1776",fa_flight_id:"TEST_ID_NOT_REAL",origin:{code_icao:"KPHL"},destination:{code_icao:"KBOS"},scheduled_out:date+"T21:25:00Z",status:"Scheduled",...over});
test("only approved dates and 23 Nov rehearsal",()=>assert.deepEqual(AA1776_DATES,["2026-11-23","2026-11-24","2026-11-25","2026-11-26"]));
test("Monday UTC window",()=>{assert.equal(inCollectionWindow("2026-11-23","2026-11-23T19:00:00Z"),true);assert.equal(inCollectionWindow("2026-11-23","2026-11-23T21:00:00Z"),false)});
test("Tuesday UTC window",()=>{assert.equal(inCollectionWindow("2026-11-24","2026-11-24T20:00:00Z"),true);assert.equal(inCollectionWindow("2026-11-24","2026-11-24T21:30:00Z"),false)});
test("Thursday UTC cutoff",()=>{assert.equal(inCollectionWindow("2026-11-26","2026-11-26T19:30:00Z"),true);assert.equal(inCollectionWindow("2026-11-26","2026-11-26T21:18:00Z"),false)});
test("actual identity, origin, destination and date required",()=>{assert.equal(selectAA1776([flight()],"2026-11-23").ok,true);assert.equal(selectAA1776([flight("2026-11-24")],"2026-11-23").ok,false);assert.equal(selectAA1776([flight("2026-11-23",{destination:{code_icao:"KJFK"}})],"2026-11-23").ok,false)});
test("multiple matching flights fail closed",()=>assert.equal(selectAA1776([flight(),flight()],"2026-11-23").error,"AMBIGUOUS_FLIGHT"));
test("reject Thursday 4h off schedule",()=>assert.equal(selectAA1776([flight("2026-11-26",{scheduled_out:"2026-11-26T16:00:00Z"})],"2026-11-26").error,"UNEXPECTED_DEPARTURE_TIME"));
test("departed and cancelled flights fail closed",()=>{assert.equal(saleDecision(flight(),"2026-11-23T21:26:00Z"),"DEPARTED");assert.equal(saleDecision(flight("2026-11-23",{status:"Cancelled"}),"2026-11-23T20:00:00Z"),"CANCELLED")});
test("unfiled or invalid route never accepted",()=>{assert.equal(routeValid({baseline_valid:false,canonical_route:"FAKE",computed_km:300,fixes:[{latitude:40,longitude:-75},{latitude:42,longitude:-71}]}),false);assert.equal(routeValid({baseline_valid:true,canonical_route:"A-B",computed_km:0,fixes:[{latitude:40,longitude:-75},{latitude:42,longitude:-71}]}),false)});
test("conservative daily cap reservations",()=>{assert.equal(MAX_DAILY_RESERVED_MILLS,2000);assert.ok(LOOKUP_RESERVATION_MILLS>=5);assert.ok(ROUTE_RESERVATION_MILLS>=10)});
test("Thursday 12 hours after scheduled landing",()=>assert.equal(aa1776PackageExpiresAt("2026-11-26","2026-11-26T22:45:00Z"),"2026-11-27T10:45:00.000Z"));
test("Monday and Tuesday internal expiry remains midnight",()=>{assert.equal(aa1776PackageExpiresAt("2026-11-23","2026-11-23T22:45:00Z"),"2026-11-24T00:00:00.000Z");assert.equal(aa1776PackageExpiresAt("2026-11-24","2026-11-24T22:45:00Z"),"2026-11-25T00:00:00.000Z")});


test("Wednesday additional rehearsal allows only 16:00 and evening window",()=>{
 assert.equal(inCollectionWindow("2026-11-25","2026-11-25T13:59:59Z"),false);
 assert.equal(inCollectionWindow("2026-11-25","2026-11-25T14:00:00Z"),false);
 assert.equal(inCollectionWindow("2026-11-25","2026-11-25T16:00:30Z"),true);
 assert.equal(inCollectionWindow("2026-11-25","2026-11-25T20:15:00Z"),true);
 assert.equal(inCollectionWindow("2026-11-25","2026-11-25T21:15:01Z"),true);
});

test("evening collection through 21:15 on Tuesday Wednesday Thursday",()=>{
 for(const d of ["2026-11-24","2026-11-25","2026-11-26"]){
  assert.equal(inCollectionWindow(d,d+"T21:15:00Z"),true,d);
  assert.equal(inCollectionWindow(d,d+"T21:15:31Z"),true,d);
  assert.equal(inCollectionWindow(d,d+"T21:18:00Z"),false,d);
 }
});
test("Wednesday flight identity accepts its own date but rejects Thursday flight",()=>{
 assert.equal(selectAA1776([flight("2026-11-25")],"2026-11-25").ok,true);
 assert.equal(selectAA1776([flight("2026-11-26")],"2026-11-25").ok,false);
});

test("Tue/Wed/Thu only 16:00 early check, no 14/15/17/18 paid windows",()=>{
 for(const d of ["2026-11-24","2026-11-25","2026-11-26"]){
  for(const t of ["14:00:00","15:00:00","15:59:59","16:10:00","16:15:00","17:00:00","18:00:00","18:45:00","18:59:59","21:30:00"])
   assert.equal(inCollectionWindow(d,d+"T"+t+"Z"),false,d+" "+t);
  for(const t of ["16:00:00","16:00:31","16:09:59","19:00:00","19:15:31","20:45:31","21:00:31","21:15:31"])
   assert.equal(inCollectionWindow(d,d+"T"+t+"Z"),true,d+" "+t);
 }
});
