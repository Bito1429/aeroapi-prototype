import {predictFlight,MODEL_VERSION} from "./model.mjs";
import {havKm} from "../api/lib.js";
const finite=Number.isFinite;
const iso=x=>typeof x==="string"&&x.endsWith("Z")&&finite(Date.parse(x));
const round=(x,n=3)=>Number(x.toFixed(n));
const validAirport=a=>a&&/^K[A-Z]{3}$/.test(a.icao)&&/^[A-Z]{3}$/.test(a.iata)&&typeof a.name==="string"&&typeof a.tz==="string"&&finite(a.lat)&&Math.abs(a.lat)<=85&&finite(a.lon)&&Math.abs(a.lon)<=180;
const fail=code=>{throw Error(code);};
export function buildTestPackage({flight,fixes,timing,filedEteSeconds,generatedAt,expiresAt}){
 if(!flight||!validAirport(flight.origin)||!validAirport(flight.destination)||typeof flight.flight_id!=="string"||!/^TEST-[A-Za-z0-9_-]{1,150}$/.test(flight.flight_id))fail("TEST_FIXTURE_REQUIRED");
 for(const k of ["scheduled_departure","scheduled_arrival","estimated_out","estimated_off"])if(!iso(flight[k]))fail("INVALID_FLIGHT_TIME");
 if(!iso(generatedAt)||!iso(expiresAt)||Date.parse(generatedAt)>=Date.parse(flight.estimated_out)||Date.parse(flight.estimated_out)>Date.parse(flight.estimated_off)||Date.parse(flight.scheduled_departure)>=Date.parse(flight.scheduled_arrival)||Date.parse(expiresAt)<=Date.parse(flight.scheduled_arrival))fail("INVALID_PACKAGE_TIME");
 if(!/^[A-Z0-9]{2,16}$/.test(flight.ident)||typeof flight.aircraft_type!=="string"||!flight.airline?.code||!flight.airline?.name)fail("INVALID_FLIGHT_METADATA");
 if(!Array.isArray(fixes)||fixes.length<2||fixes.length>2000)fail("INVALID_ROUTE_FIXES");
 const origin=flight.origin,destination=flight.destination;
 const clean=[{name:origin.icao,latitude:origin.lat,longitude:origin.lon},...fixes.filter(f=>f?.name!==origin.icao&&f?.name!==destination.icao),{name:destination.icao,latitude:destination.lat,longitude:destination.lon}];
 const pred=predictFlight({origin:origin.icao,destination:destination.icao,fixes:clean,timing,takeoffUtc:flight.estimated_off,filedEteSeconds});
 if(pred.status!=="CANDIDATE_ONLY")fail("TIMING_UNAVAILABLE");
 const points=pred.route.points,dist=[0];
 for(let i=1;i<points.length;i++){if(Math.abs(points[i].longitude-points[i-1].longitude)>180)fail("UNSUPPORTED_DATELINE");dist.push(dist[i-1]+havKm(points[i-1],points[i]));}
 const total=dist.at(-1),duration=pred.timing.durationSeconds/60;
 if(!finite(total)||total<=0||!finite(duration)||duration<=0||duration>1440)fail("INVALID_PREDICTION");
 const at=f=>{const target=total*f;let i=1;while(i<dist.length-1&&dist[i]<target)i++;const a=points[i-1],b=points[i],span=dist[i]-dist[i-1],q=span?(target-dist[i-1])/span:0;return [a.latitude+(b.latitude-a.latitude)*q,a.longitude+(b.longitude-a.longitude)*q];};
 // Candidate timeline uses constant distance fraction, NOT validated time-position prediction.
 const count=Math.ceil(duration/2),timeline=Array.from({length:count+1},(_,i)=>{const f=i/count,[lat,lon]=at(f);return {t_min:round(duration*f,6),lat:round(lat,6),lon:round(lon,6),dist_km:round(total*f),phase:i===0?"takeoff":i===count?"landing":"cruise",gs_kmh:round(total/(duration/60))};});
 // Illustrative 18 km statistical ribbon / 6 km display half-width, not route-specific calibration.
 const offset=(p,q,sign)=>{const lat=p.latitude*Math.PI/180,dy=q.latitude-p.latitude,dx=(q.longitude-p.longitude)*Math.cos(lat),len=Math.hypot(dx,dy);if(!len)fail("DUPLICATE_ROUTE_POINT");return [p.latitude+sign*18/111.195*dx/len,p.longitude-sign*18/111.195*dy/len/Math.cos(lat)];};
 const sides=[1,-1].map(sign=>points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];return offset(p,{latitude:p.latitude+b.latitude-a.latitude,longitude:p.longitude+b.longitude-a.longitude},sign);}));
 const polygon=[...sides[0],...sides[1].reverse(),sides[0][0]];
 const half=pred.timing.windowSeconds/60,preHalf=pred.timing.source==="ENTRY_762_FILED_ETE_FALLBACK"?17:half;
 if(Date.parse(expiresAt)<=Date.parse(flight.estimated_off)+(duration+preHalf)*60000)fail("EXPIRY_BEFORE_LANDING_WINDOW");
 return {schema:"aevpath.package.v1",schema_minor:0,package_version:"test-"+generatedAt.replace(/[^0-9]/g,""),flight_id:flight.flight_id,market:"US",test_only:true,generated_at:generatedAt,expires_at:expiresAt,frozen_after:"takeoff",attribution:"Synthetic AevPath test fixture; not for navigation",flight:{ident:flight.ident,ident_icao:flight.ident,airline:flight.airline,origin,destination,scheduled_departure:flight.scheduled_departure,scheduled_arrival:flight.scheduled_arrival,aircraft_type:flight.aircraft_type,estimated_out:flight.estimated_out},route:{total_distance_km:round(total),line:points.map(p=>[p.latitude,p.longitude]),waypoints:points.map((p,i)=>({name:i===0?origin.icao:i===points.length-1?destination.icao:"TEST-"+String(i).padStart(3,"0"),lat:p.latitude,lon:p.longitude,type:"Waypoint"})),sanity:{status:"OK",reason:null}},corridor:{polygon,display_half_width_km:6,statistical:{half_width_km:18,coverage:.8}},timeline,pois:[],eta:{expected_airborne_min:duration,airborne_window_min:{earliest:duration-half,latest:duration+half,coverage:.8},departure:{estimated_off:flight.estimated_off,window_min:{earliest:-17,latest:17,coverage:.8}},display_label:"Landing window"},check_again_after:new Date(Date.parse(flight.estimated_out)-1800000).toISOString(),candidate_metadata:{model_version:MODEL_VERSION,timing_source:pred.timing.source,timing_anchor:"ESTIMATED_OFF_NOT_DETECTED_TAKEOFF",position_status:"UNVALIDATED_CONSTANT_SPEED",corridor_status:"ILLUSTRATIVE_NOT_CALIBRATED",waypoint_status:"SYNTHETIC_LABELS",official_checker_status:"NOT_RUN",nominal_coverage_only:true,departure_window_status:"ILLUSTRATIVE_NOT_CALIBRATED",predeparture_landing_window:{earliest:new Date(Date.parse(flight.estimated_off)+(duration-preHalf)*60000).toISOString(),latest:new Date(Date.parse(flight.estimated_off)+(duration+preHalf)*60000).toISOString(),status:pred.timing.source==="ENTRY_762_FILED_ETE_FALLBACK"?"ENTRY_762_VALIDATED_PREDEPARTURE_RULE":"ROUTE_HISTORY_CANDIDATE_NOT_PREDEPARTURE_VALIDATED"},sellable:false}};
}
