import {canonicalize,havKm} from "./geometry.js";
import {modelFiledTimeline} from "./filed-timeline.js";
import {toChesterV1} from "./chester-schema.js";
export const DATE="2026-11-27", START="2026-11-27T14:30:00Z", END="2026-11-27T17:18:00Z", EXPECTED_OUT="2026-11-27T17:30:00Z";
export const TIMING=Object.freeze({seconds:14142,windowSeconds:960,samples:16,looCoverage:.8125,looMaeSeconds:525.125,version:"us-any-flight-candidate-20261125"});
// Static public airport reference: OurAirports KORD and KSEA, reviewed 25 Nov 2026.
const origin={code_iata:"ORD",code_icao:"KORD",name:"Chicago O'Hare International Airport",timezone:"America/Chicago",latitude:41.9786,longitude:-87.9048};
const destination={code_iata:"SEA",code_icao:"KSEA",name:"Seattle–Tacoma International Airport",timezone:"America/Los_Angeles",latitude:47.4479,longitude:-122.31};
const ms=x=>x instanceof Date?x.getTime():typeof x==="string"?Date.parse(x):NaN;
const code=x=>String(x?.code_icao||x?.code||x||"").toUpperCase();
export function selectFlight(flights){
 const valid=(Array.isArray(flights)?flights:[]).filter(f=>/^(AAL|AA)2398$/.test(String(f?.ident_icao||f?.ident||"").toUpperCase())&&code(f.origin)==="KORD"&&code(f.destination)==="KSEA"&&Number.isFinite(ms(f.scheduled_out))&&Math.abs(ms(f.scheduled_out)-ms(EXPECTED_OUT))<=7200000);
 if(valid.length!==1)return {reason:valid.length?"AMBIGUOUS_FLIGHT":"FLIGHT_NOT_FOUND"};
 const f=valid[0];if(typeof f.fa_flight_id!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(f.fa_flight_id))return {reason:"MISSING_FLIGHT_ID"};
 return {flight:f};
}
export function eligibility(f,now){
 const t=ms(now),out=ms(f?.scheduled_out);
 if(/cancel/i.test(String(f?.status||"")))return "CANCELLED";
 if(f?.actual_out||f?.actual_off||/depart|en.?route|airborne|arriv|landed/i.test(String(f?.status||"")))return "DEPARTED";
 if(!Number.isFinite(t)||!Number.isFinite(out)||out<=t)return "DEPARTED";
 if(!Number.isFinite(ms(f.estimated_out))||!Number.isFinite(ms(f.estimated_off))||!Number.isFinite(ms(f.scheduled_on))||ms(f.scheduled_on)<=out||ms(f.estimated_off)<ms(f.estimated_out)||f.ident_icao!=="AAL2398"||typeof f.aircraft_type!=="string"||!f.aircraft_type)return "PENDING_SOURCE";
 return "ELIGIBLE";
}
export function buildPackage(f,rawFixes,now,{synthetic=false}={}){
 if(eligibility(f,now)!=="ELIGIBLE")throw Error("SOURCE_INELIGIBLE");
 if(!Array.isArray(rawFixes)||rawFixes.length<2||rawFixes.length>2000||rawFixes.some(p=>!p?.name||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180))throw Error("INVALID_ROUTE");
 const route=canonicalize(rawFixes),points=route.fixes.map(p=>({name:p.name,latitude:p.latitude,longitude:p.longitude}));
 const direct=havKm(origin,destination);
 if(!route.baseline_valid||points.length<2||route.computed_km<direct*.85||route.computed_km>direct*1.7||havKm(origin,points[0])>200||havKm(destination,points.at(-1))>200)throw Error("ROUTE_SANITY_FAILED");
 const timeline=modelFiledTimeline(points,{durationSeconds:TIMING.seconds,distanceKm:route.computed_km});
 const expiresAt=new Date(Math.min(ms(f.scheduled_on)+12*3600000,Date.parse("2026-11-28T12:00:00Z"))).toISOString();
 const airline={code:"AA",name:"American Airlines"};
 const p=toChesterV1({status:"READY",generated_at:now,flight:{id:f.fa_flight_id,ident:f.ident||"AAL2398",ident_icao:f.ident_icao,scheduled_out:f.scheduled_out,scheduled_arrival:f.scheduled_on,estimated_off:f.estimated_off,estimated_out:f.estimated_out,actual_off:f.actual_off},route:{distance_km:route.computed_km,fixes:points,resolver_sanity:{ok:true},timeline},eta:{duration_seconds:TIMING.seconds}},{airports:{origin,destination},airline,aircraftType:f.aircraft_type,expiresAt});
 p.eta.airborne_window_min={earliest:(TIMING.seconds-TIMING.windowSeconds)/60,latest:(TIMING.seconds+TIMING.windowSeconds)/60,coverage:.8};
 p.test_only=true;p.candidate_metadata={sellable:false,timing_source:"HISTORICAL_ROUTE_MEDIAN_CANDIDATE",model_version:TIMING.version,sample_count:TIMING.samples,observed_loo_coverage:TIMING.looCoverage,independent_holdout:false,position_status:"MODELED_PROFILE_NOT_POSITION_VALIDATED",corridor_status:"NOT_ROUTE_SPECIFIC_CALIBRATED",official_checker_status:"NOT_RUN",synthetic};
 if(synthetic)p.attribution="Synthetic AevPath AA2398 test fixture; not for navigation";
 return p;
}
export async function collect({claim,reserve,lookup,route,mark,store,now,requestId,providerConfigured=true}){
 const c=await claim();if(c!=="CLAIMED")return {status:c,providerCalls:0};
 let providerCalls=0;
 if(!providerConfigured){await mark("PENDING_SOURCE","PROVIDER_NOT_CONFIGURED");return {status:"PENDING_SOURCE",providerCalls};}
 try{
 const q=await reserve(requestId(),"LOOKUP");if(q!=="RESERVED")return {status:q,providerCalls};
 providerCalls++;const selected=selectFlight((await lookup())?.flights);
 if(!selected.flight){await mark("PENDING_SOURCE",selected.reason);return {status:"PENDING_SOURCE",reason:selected.reason,providerCalls};}
 const f=selected.flight,state=eligibility(f,now);
 if(state!=="ELIGIBLE"){await mark(state,"FLIGHT_NOT_ELIGIBLE");return {status:state,providerCalls};}
 const r=await reserve(requestId(),"ROUTE");if(r!=="RESERVED")return {status:r,providerCalls};
 providerCalls++;const fixes=(await route(f.fa_flight_id))?.fixes;
 let p;try{p=buildPackage(f,fixes,now);}catch{await mark("PENDING_ROUTE","ROUTE_OR_PACKAGE_INVALID");return {status:"PENDING_ROUTE",providerCalls};}
 const saved=await store(p);return {status:saved==="STORED"?"READY":saved,providerCalls};
 }catch{await mark("PENDING_SOURCE","COLLECTION_FAILED");return {status:"PENDING_SOURCE",providerCalls};}
}
