import crypto from "node:crypto";
import{db}from"./db.js";
import{havKm,polyKm}from"./lib.js";

function round(n,d=6){return Number.isFinite(n)?+n.toFixed(d):null;}
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==="object"){
  const o={};for(const k of Object.keys(value).sort())o[k]=stable(value[k]);return o;
 }
 return value;
}
export function etagFor(body){
 const raw=JSON.stringify(stable(body));
 return '"'+crypto.createHash("sha256").update(raw).digest("hex").slice(0,24)+'"';
}
function pointAtFraction(points,f){
 if(!points?.length)return null;
 if(points.length===1)return points[0];
 const total=polyKm(points);if(total<=0)return points[0];
 const target=total*Math.max(0,Math.min(1,f));let d=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],leg=havKm(a,b);
  if(d+leg>=target){
   const q=leg?((target-d)/leg):0;
   return{latitude:a.latitude+(b.latitude-a.latitude)*q,longitude:a.longitude+(b.longitude-a.longitude)*q};
  }
  d+=leg;
 }
 return points.at(-1);
}
export function denseTimeline(points,{startIso=null,durationSeconds=null,maxMinutes=2,maxKm=25}={}){
 const clean=(points||[]).filter(p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude));
 if(clean.length<2)return[];
 const km=polyKm(clean);
 const byDistance=Math.max(1,Math.ceil(km/maxKm));
 const byTime=Number.isFinite(durationSeconds)&&durationSeconds>0?Math.max(1,Math.ceil(durationSeconds/(maxMinutes*60))):1;
 const segments=Math.max(byDistance,byTime);
 const start=startIso?new Date(startIso).getTime():NaN;
 return Array.from({length:segments+1},(_,i)=>{
  const f=i/segments,p=pointAtFraction(clean,f);
  return{
   fraction:+f.toFixed(6),
   latitude:round(p.latitude),
   longitude:round(p.longitude),
   ...(Number.isFinite(start)&&Number.isFinite(durationSeconds)&&durationSeconds>0?{timestamp:new Date(start+f*durationSeconds*1000).toISOString()}:{}),
  };
 });
}
function sanity(protocol){
 if(!protocol)return{ok:false,reason:"NO_ROUTE_PROTOCOL"};
 if(protocol.baseline_valid===false)return{ok:false,reason:"MISSING_FIX_COORDINATES"};
 if(!Array.isArray(protocol.fixes)||protocol.fixes.filter(p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)).length<2)return{ok:false,reason:"INSUFFICIENT_ROUTE_POINTS"};
 if(!Number.isFinite(protocol.computed_km)||protocol.computed_km<=0)return{ok:false,reason:"INVALID_ROUTE_DISTANCE"};
 return{ok:true,reason:"OK"};
}
export async function buildDraftPackage(flightId){
 const sql=db();
 const jobs=await sql`select * from flight_jobs where fa_flight_id=${flightId} order by created_at desc limit 1`;
 const job=jobs[0];if(!job)return{status:404,body:{error:"FLIGHT_NOT_FOUND",flight_id:flightId}};
 const caps=await sql`select * from flight_captures where flight_job_id=${job.id}::uuid order by captured_at desc limit 1`;
 const cap=caps[0]||null;
 const raw=cap?.raw_capture||null,protocol=raw?.protocol||null,flight=raw?.flight||null;
 if(!protocol?.canonical_route||!Array.isArray(protocol?.fixes)||protocol.fixes.length<2){
  return{status:202,body:{status:"PENDING_ROUTE",flight_id:flightId,package_version:1,retryable:true}};
 }
 const s=sanity(protocol);
 const startIso=flight?.estimated_off||flight?.scheduled_off||job.scheduled_out_initial||null;
 const durationSeconds=Number(cap?.filed_ete_seconds||flight?.filed_ete||0)||null;
 const points=protocol.fixes.filter(p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)).map(p=>({name:p.name||null,latitude:p.latitude,longitude:p.longitude}));
 const body={
  status:"READY",
  package_version:1,
  flight:{
   id:flightId,
   ident:job.ident,
   origin:job.origin,
   destination:job.destination,
   scheduled_out:job.scheduled_out_initial,
   estimated_off:flight?.estimated_off||null
  },
  route:{
   canonical_hash:protocol.canonical_hash||cap?.canonical_hash||null,
   canonical_route:protocol.canonical_route,
   distance_km:protocol.computed_km??cap?.baseline_km??null,
   fixes:points,
   resolver_sanity:s,
   timeline:denseTimeline(points,{startIso,durationSeconds,maxMinutes:2,maxKm:25})
  },
  eta:{
   baseline_source:"FILED_ETE",
   duration_seconds:durationSeconds,
   windows:null
  },
  corridor:{
   half_width_km:null,
   polygon:null,
   status:"PENDING_CALIBRATION"
  },
  generated_at:new Date().toISOString()
 };
 return{status:200,body};
}
