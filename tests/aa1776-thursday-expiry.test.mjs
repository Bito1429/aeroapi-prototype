import test from "node:test";
import assert from "node:assert/strict";
import {aa1776PackageExpiresAt} from "../api/aa1776-policy.js";
import {toChesterV1} from "../api/chester-schema.js";
import {aa1776SaleState} from "../chester-reference/chester-standalone/source/lib/aa1776-relay.js";

const arrive="2026-11-26T22:45:00Z";
test("THURSDAY ONLY: scheduled arrival + 12h crosses midnight",()=>{
 assert.equal(aa1776PackageExpiresAt("2026-11-26",arrive),"2026-11-27T10:45:00.000Z");
 assert.equal(aa1776PackageExpiresAt("2026-11-24","2026-11-24T22:45:00Z"),"2026-11-25T00:00:00.000Z");
 assert.ok(Date.parse(aa1776PackageExpiresAt("2026-11-26",arrive))>Date.parse("2026-11-27T04:00:00Z"));
});
test("reject missing scheduled arrival rather than inventing arrival",()=>{
 assert.throws(()=>aa1776PackageExpiresAt("2026-11-26",null),/SCHEDULED_ARRIVAL_REQUIRED/);
});
const a=(iata,icao,name,latitude,longitude)=>({code_iata:iata,code_icao:icao,name,timezone:"America/New_York",latitude,longitude});
const origin=a("PHL","KPHL","Philadelphia International Airport",39.8744,-75.2424);
const destination=a("BOS","KBOS","Boston Logan International Airport",42.3656,-71.0096);
function testDraft(){
 return{status:"READY",generated_at:"2026-11-26T19:30:00Z",
  flight:{id:"TEST_ONLY_NOT_REAL_FA_ID",ident:"AAL1776",ident_icao:"AAL1776",
   scheduled_out:"2026-11-26T21:25:00Z",scheduled_arrival:arrive,
   estimated_off:"2026-11-26T21:40:00Z",estimated_out:"2026-11-26T21:25:00Z",
   origin_airport:origin,destination_airport:destination,
   airline:{code:"AA",name:"American Airlines"},aircraft_type:"A320"},
  route:{distance_km:430,
   fixes:[{name:"KPHL",latitude:39.8744,longitude:-75.2424},{name:"KBOS",latitude:42.3656,longitude:-71.0096}],
   resolver_sanity:{ok:true},
   timeline:[
    {fraction:0,latitude:39.8744,longitude:-75.2424,t_min:0,dist_km:0,phase:"takeoff",gs_kmh:430},
    {fraction:1,latitude:42.3656,longitude:-71.0096,t_min:60,dist_km:430,phase:"landing",gs_kmh:430}
   ]},
  eta:{duration_seconds:3600}
 };
}
test("Chester v1 adapter accepts test-only package with 12-hour Thursday expiry",()=>{
 const draft=testDraft();
 const pkg=toChesterV1(draft,{airports:{origin,destination},
   airline:draft.flight.airline,aircraftType:draft.flight.aircraft_type,
   expiresAt:aa1776PackageExpiresAt("2026-11-26",arrive)});
 assert.equal(pkg.schema,"aevpath.package.v1");
 assert.equal(pkg.expires_at,"2026-11-27T10:45:00.000Z");
 assert.equal(pkg.flight.scheduled_departure,"2026-11-26T21:25:00Z");
 assert.equal(pkg.flight.origin.icao,"KPHL");
 assert.equal(pkg.flight.destination.icao,"KBOS");
 assert.equal(pkg.market,"US");
 assert.ok(pkg.timeline.length>=2);
 assert.ok(pkg.corridor.polygon.length>=4);
 // The downloaded document's timestamp remains valid at 00:30 UTC.
 assert.ok(Date.parse(pkg.expires_at)>Date.parse("2026-11-27T00:30:00Z"));
 // This is a contract test only; cannot establish iOS offline behaviour.
});
test("even with longer package expiry, Chester refuses new purchases after midnight",()=>{
 const row={flight_date:"2026-11-26",fa_flight_id:"TEST_ONLY_NOT_REAL_FA_ID",
   scheduled_out:"2026-11-26T21:25:00Z",expires_at:"2026-11-27T00:00:00Z",
   upstream_state:"READY",package_json:{
    schema:"aevpath.package.v1",market:"US",flight_id:"TEST_ONLY_NOT_REAL_FA_ID",
    expires_at:"2026-11-27T10:45:00Z",
    flight:{scheduled_departure:"2026-11-26T21:25:00Z",
     origin:{icao:"KPHL"},destination:{icao:"KBOS"}}
   }};
 assert.equal(aa1776SaleState(row,"2026-11-27T00:30:00Z"),"DEPARTED");
 assert.equal(aa1776SaleState(row,"2026-11-26T22:00:00Z"),"DEPARTED");
});
