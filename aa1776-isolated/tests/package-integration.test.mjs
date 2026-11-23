import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {airportView} from "../lib/airport-reference.js";
import {canonicalize} from "../lib/lib.js";
import {checkFlightFields,packageFromLive} from "../api/cron.js";
import {toChesterV1} from "../lib/chester-schema.js";
import {AA1776_DATES,aa1776PackageExpiresAt,MAX_DAILY_PROVIDER_REQUESTS,MIN_RETRY_INTERVAL_MS,paidCheckDecision} from "../lib/aa1776-policy.js";

// No paid service calls. The historical v1 fixture is a real persisted/accepted
// November 8 flight, not AA1776. We do not manufacture an AA1776 route.
const stored=JSON.parse(readFileSync(new URL("../../fixtures/chester-system-UAL2096-20261108.json",import.meta.url),"utf8"));
function restoredSource(){
 const x=stored.flight;
 return {
  fa_flight_id:stored.flight_id,ident:x.ident,ident_icao:x.ident_icao,
  operator_icao:x.ident_icao.slice(0,3),
  origin:{code_icao:x.origin.icao,code_iata:x.origin.iata,name:x.origin.name,latitude:x.origin.lat,longitude:x.origin.lon,timezone:x.origin.tz},
  destination:{code_icao:x.destination.icao,code_iata:x.destination.iata,name:x.destination.name,latitude:x.destination.lat,longitude:x.destination.lon,timezone:x.destination.tz},
  scheduled_out:x.scheduled_departure,scheduled_on:x.scheduled_arrival,
  estimated_out:x.estimated_out,estimated_off:stored.eta.departure.estimated_off,
  filed_ete:stored.eta.expected_airborne_min*60,aircraft_type:x.aircraft_type,
  status:"Scheduled"
 };
}
function routeProtocol(){
 return canonicalize(stored.route.waypoints.map(p=>({name:p.name,latitude:p.lat,longitude:p.lon})));
}
test("airport metadata from MIT airportsdata resolves even with ICAO-only AeroAPI payload",()=>{
 const phl=airportView({code_icao:"KPHL"}),bos=airportView("KBOS");
 for(const a of [phl,bos]){
  assert.ok(a.code_iata&&a.code_icao&&a.name&&a.timezone);
  assert.ok(Number.isFinite(a.latitude)&&Number.isFinite(a.longitude));
 }
 assert.equal(phl.code_iata,"PHL");assert.equal(bos.code_iata,"BOS");
 assert.equal(phl.timezone,"America/New_York");
 assert.equal(bos.name,"General Edward Lawrence Logan International Airport");
 assert.equal(airportView({code_icao:"ZZZZ"}).code_iata,null);
});
test("all source fields required before paid route request",()=>{
 const src=restoredSource();assert.deepEqual(checkFlightFields(src),{ok:true});
 for(const key of ["ident_icao","aircraft_type","filed_ete","estimated_off","estimated_out","scheduled_on"]){
  assert.equal(checkFlightFields({...src,[key]:null}).ok,false,key);
 }
 assert.equal(checkFlightFields({...src,origin:{code_icao:"UNKNOWN"}}).reason,"CHESTER_REQUIRED_FIELD:airport.metadata");
});
test("actual historical flight fixture builds through the SAME package builder and v1 adapter, offline",()=>{
 const flight=restoredSource(),route=routeProtocol();
 assert.equal(route.baseline_valid,true);
 assert.equal(checkFlightFields(flight).ok,true);
 const out=packageFromLive(flight,route,stored.generated_at,"2026-11-08");
 assert.equal(out.schema,"aevpath.package.v1");assert.equal(out.flight_id,stored.flight_id);
 assert.equal(out.market,"US");
 assert.equal(out.flight.origin.icao,stored.flight.origin.icao);
 assert.equal(out.flight.destination.icao,stored.flight.destination.icao);
 assert.equal(out.flight.airline.name,stored.flight.airline.name);
 assert.equal(out.flight.aircraft_type,stored.flight.aircraft_type);
 assert.equal(out.flight.estimated_out,stored.flight.estimated_out);
 assert.equal(out.flight.scheduled_departure,stored.flight.scheduled_departure);
 assert.equal(out.flight.scheduled_arrival,stored.flight.scheduled_arrival);
 assert.ok(Number.isFinite(out.route.total_distance_km)&&out.route.total_distance_km>0);
 assert.ok(out.route.line.length>=2&&out.route.waypoints.length>=2);
 assert.equal(out.route.sanity.status,"OK");
 assert.ok(out.corridor.polygon.length>=4);
 assert.equal(out.corridor.display_half_width_km,6);
 assert.ok(out.timeline.length>=2);
 assert.deepEqual([...new Set(out.timeline.map(p=>p.phase))],["takeoff","climb","cruise","descent","landing"]);
 assert.ok(out.timeline.every(p=>Number.isFinite(p.t_min)&&Number.isFinite(p.dist_km)&&Number.isFinite(p.gs_kmh)));
 assert.ok(Number.isFinite(out.eta.expected_airborne_min)&&out.eta.expected_airborne_min>0);
 assert.ok(out.eta.airborne_window_min.latest>out.eta.airborne_window_min.earliest);
 assert.ok(out.eta.departure.estimated_off);
 assert.equal(out.eta.display_label,"Landing window");
 assert.equal(out.frozen_after,"takeoff");
 assert.ok(out.attribution.includes("FlightAware")&&out.attribution.includes("OpenStreetMap"));
 assert.ok(Date.parse(out.expires_at)>Date.parse(out.generated_at));
 assert.equal(out.expires_at,aa1776PackageExpiresAt("2026-11-08",flight.scheduled_on));
 assert.equal(JSON.stringify(out).includes("x-apikey"),false);
});
test("v1 adapter deterministically refuses missing required route/timeline",()=>{
 const flight=restoredSource(),route=routeProtocol();
 assert.throws(()=>packageFromLive(flight,{...route,fixes:route.fixes.slice(0,1)},stored.generated_at,"2026-11-08"),/TIMELINE_UNAVAILABLE/);
 assert.throws(()=>packageFromLive({...flight,estimated_out:null},route,stored.generated_at,"2026-11-08"),/CHESTER_REQUIRED_FIELD:flight.estimated_out/);
});
test("Thursday source landing +12 h is package expiry (and relay must use that timestamp)",()=>{
 const when="2026-11-26T22:45:00Z";
 assert.equal(aa1776PackageExpiresAt("2026-11-26",when),"2026-11-27T10:45:00.000Z");
});
test("hard request cap + cooldown + Wednesday rehearsal policy",()=>{
 assert.ok(MAX_DAILY_PROVIDER_REQUESTS<=16);
 assert.ok(MIN_RETRY_INTERVAL_MS>=55*60000);
 assert.deepEqual(AA1776_DATES,["2026-11-23","2026-11-24","2026-11-25","2026-11-26"]);
});

test("actual retry gate skips 15-minute repeat, terminal READY, and 16-call cap",()=>{
 const date="2026-11-24T14:00:00Z";
 assert.equal(paidCheckDecision({state:"PENDING_SOURCE",lastCheckedAt:date,now:"2026-11-24T14:15:00Z",requestCount:2}),"RETRY_COOLDOWN");
 assert.equal(paidCheckDecision({state:"PENDING_SOURCE",lastCheckedAt:date,now:"2026-11-24T15:00:00Z",requestCount:2}),"CHECK_ROUTE");
 assert.equal(paidCheckDecision({state:"READY",lastCheckedAt:date,now:"2026-11-24T17:00:00Z"}),"TERMINAL_STATE");
 assert.equal(paidCheckDecision({state:"PENDING_SOURCE",lastCheckedAt:date,now:"2026-11-24T17:00:00Z",requestCount:16}),"DAILY_REQUEST_CAP_REACHED");
});
