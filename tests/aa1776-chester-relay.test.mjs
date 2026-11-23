import test from"node:test";
import assert from"node:assert/strict";
import{aa1776SaleState,aa1776Summary,ALLOWED_DATES}from"../chester-standalone/source/lib/aa1776-relay.js";
function row(options={}){
 return{
  flight_date:"2026-11-24",fa_flight_id:"genuine-provider-id",
  upstream_state:"READY",source_captured_at:"2026-11-24T19:30:00Z",
  scheduled_out:"2026-11-24T21:25:00Z",
  expires_at:"2026-11-25T00:00:00Z",
  package_json:{schema:"aevpath.package.v1",market:"US",flight_id:"genuine-provider-id",
   flight:{ident:"AAL1776",scheduled_departure:"2026-11-24T21:25:00Z",
   origin:{icao:"KPHL"},destination:{icao:"KBOS"}}},
  ...options
 };
}
test("only two authorized Plan B dates",()=>{
 assert.deepEqual([...ALLOWED_DATES],["2026-11-23","2026-11-24","2026-11-26"]);
});
test("valid genuine source-derived package is sellable before gate-out",()=>{
 assert.equal(aa1776SaleState(row(),"2026-11-24T20:00:00Z"),"SELLABLE");
 const s=aa1776Summary(row(),"2026-11-24T20:00:00Z");
 assert.equal(s.flight_id,"genuine-provider-id");
 assert.equal(s.origin,"KPHL");assert.equal(s.destination,"KBOS");
});
test("refuse departed or cancelled even when package exists",()=>{
 assert.equal(aa1776SaleState(row(),"2026-11-24T21:26:00Z"),"DEPARTED");
 assert.equal(aa1776SaleState(row({upstream_state:"DEPARTED"}),"2026-11-24T20:00:00Z"),"DEPARTED");
 assert.equal(aa1776SaleState(row({upstream_state:"CANCELLED"}),"2026-11-24T20:00:00Z"),"CANCELLED");
});
test("fail closed on pending, expired, mismatched date, market, and route",()=>{
 assert.equal(aa1776SaleState(null,"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
 assert.equal(aa1776SaleState(row({upstream_state:"PENDING_ROUTE"}),"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
 assert.equal(aa1776SaleState(row({expires_at:"2026-11-24T19:30:00Z"}),"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
 assert.equal(aa1776SaleState(row({flight_date:"2026-11-26"}),"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
 assert.equal(aa1776SaleState(row({package_json:{...row().package_json,market:"EU"}}),"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
 assert.equal(aa1776SaleState(row({package_json:{...row().package_json,flight:{...row().package_json.flight,destination:{icao:"KJFK"}}}}),"2026-11-24T20:00:00Z"),"PENDING_ROUTE");
});
