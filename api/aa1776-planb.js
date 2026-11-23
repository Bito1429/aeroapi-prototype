// Isolated AA1776 Plan B: US paid AeroAPI only; test-only; no raw data persisted.
// Entry points: Vercel cron (mode=check) and Chester key (mode=package/status).
// There are no changes to the 250-flight/day cohort or European trial.
import{timingSafeEqual}from"node:crypto";
import{aero,flightView,canonicalize,json}from"./lib.js";
import{db}from"./db.js";
import{etaPackage}from"./eta-calibration.js";
import{modelFiledTimeline}from"./filed-timeline.js";
import{toChesterV1}from"./chester-schema.js";
import{inCollectionWindow,isTargetDate,selectAA1776,saleDecision,routeValid,LOOKUP_RESERVATION_MILLS,ROUTE_RESERVATION_MILLS,MAX_DAILY_RESERVED_MILLS,aa1776PackageExpiresAt}from"./aa1776-policy.js";

function equalSecret(provided,expected){
 if(!expected||typeof provided!=="string")return false;
 const a=Buffer.from(provided),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function authorized(req){
 const auth=String(req.headers?.authorization||"");
 const cron=auth.startsWith("Bearer ")?auth.slice(7):"";
 const chester=req.headers?.["x-aevpath-key"];
 return equalSecret(cron,process.env.CRON_SECRET)||equalSecret(chester,process.env.CHESTER_SHARED_KEY);
}
async function reserve(sql,date,mills,kind){
 if(!Number.isSafeInteger(mills)||mills<=0||mills>MAX_DAILY_RESERVED_MILLS)throw Error("INVALID_BUDGET_RESERVATION");
 // PostgreSQL atomic conflict-upsert: concurrent functions cannot overrun the ledger.
 const rows=await sql`insert into aa1776_planb_budget(usage_date,reserved_mills,request_count)
 values(${date}::date,${mills},1)
 on conflict(usage_date) do update set
 reserved_mills=aa1776_planb_budget.reserved_mills+excluded.reserved_mills,
 request_count=aa1776_planb_budget.request_count+1,
 updated_at=now()
 where aa1776_planb_budget.reserved_mills+excluded.reserved_mills<=${MAX_DAILY_RESERVED_MILLS}
 returning reserved_mills,request_count`;
 if(!rows.length)throw Object.assign(Error("DAILY_COST_CAP_REACHED"),{httpStatus:429});
 return rows[0]; // Reserve even on provider errors (never refund).
}
async function mark(sql,date,state,code,flightId=null){
 // Only derived status/identity metadata: no provider payload, route text or raw tracks.
 await sql`insert into aa1776_planb_state(flight_date,state,reason,fa_flight_id,last_checked_at)
 values(${date}::date,${state},${code},${flightId},now())
 on conflict(flight_date) do update set
 state=excluded.state,reason=excluded.reason,fa_flight_id=excluded.fa_flight_id,last_checked_at=now(),
 ready_at=case when excluded.state='READY' then now() else aa1776_planb_state.ready_at end`;
}
function packageFromLive(f,protocol,nowIso,flightDate){
 const flight=flightView(f);
 const estimatedOff=flight.estimated_off;
 const duration=Number(flight.filed_ete);
 if(!estimatedOff||!Number.isFinite(Date.parse(estimatedOff))||
    !flight.estimated_out||!Number.isFinite(Date.parse(flight.estimated_out))||
    !Number.isFinite(duration)||duration<=0||
    !flight.scheduled_on||!Number.isFinite(Date.parse(flight.scheduled_on))||
    !flight.ident_icao||!flight.airline||!flight.aircraft_type||
    !flight.origin_airport||!flight.destination_airport)
  throw Object.assign(Error("SOURCE_FIELDS_INCOMPLETE"),{httpStatus:202});
 const routePoints=protocol.fixes.map(p=>({name:p.name||null,latitude:p.latitude,longitude:p.longitude}));
 const routeKm=protocol.computed_km;
 const timeline=modelFiledTimeline(routePoints,{durationSeconds:duration,distanceKm:routeKm});
 if(timeline.length<2)throw Object.assign(Error("TIMELINE_UNAVAILABLE"),{httpStatus:202});
 const draft={
  status:"READY",generated_at:nowIso,flight:{
   id:flight.fa_flight_id,ident:flight.ident,ident_icao:flight.ident_icao,
   scheduled_out:flight.scheduled_out,scheduled_arrival:flight.scheduled_on,
   estimated_off:estimatedOff,estimated_out:flight.estimated_out,
   origin_airport:flight.origin_airport,destination_airport:flight.destination_airport,
   airline:flight.airline,aircraft_type:flight.aircraft_type
  },
  route:{distance_km:routeKm,fixes:routePoints,resolver_sanity:{ok:true},timeline},
  eta:etaPackage({estimatedOff,filedEteSeconds:duration})
 };
 const expiresAt=aa1776PackageExpiresAt(flightDate,flight.scheduled_on);
 return toChesterV1(draft,{
  airports:{origin:flight.origin_airport,destination:flight.destination_airport},
  airline:flight.airline,aircraftType:flight.aircraft_type,expiresAt
 });
}
function deny(res,status,error,detail={}){
 res.setHeader("cache-control","private, no-store");
 return json(res,status,{ok:false,error,...detail});
}
export default async function handler(req,res){
 res.setHeader("cache-control","private, no-store");
 if(req.method!=="GET")return deny(res,405,"METHOD_NOT_ALLOWED");
 if(process.env.VERCEL_ENV!=="production"||
   (process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!=="prj_wcoYJXDO1t3LjHLDVtllNDIbq4m6"))
  return deny(res,503,"US_PRODUCTION_ONLY");
 if(!authorized(req))return deny(res,401,"UNAUTHORIZED");
 const now=new Date(),nowIso=now.toISOString(),today=nowIso.slice(0,10);
 const mode=String(req.query?.mode||"check");
 const date=String(req.query?.date||today);
 if(!["check","package","status"].includes(mode)||!isTargetDate(date))
  return deny(res,400,"INVALID_REQUEST");
 try{
  const sql=db();
  const ctl=await sql`select enabled from aa1776_planb_control where id=1`;
  if(!ctl[0]?.enabled)return deny(res,503,"AA1776_NOT_ENABLED");
  if(mode==="status"){
   const [state,budget]=await Promise.all([
    sql`select flight_date,state,reason,fa_flight_id,last_checked_at,ready_at from aa1776_planb_state where flight_date=${date}::date`,
    sql`select usage_date,reserved_mills,request_count from aa1776_planb_budget where usage_date=${today}::date`
   ]);
   return json(res,200,{ok:true,flight_date:date,state:state[0]||null,today_budget:budget[0]||{reserved_mills:0,request_count:0},max_reserved_mills:MAX_DAILY_RESERVED_MILLS});
  }
  // No scheduled/interactive calls on other days, outside narrow UTC windows,
  // or before the real flight can be captured within 24 hours of departure.
  if(today!==date||!inCollectionWindow(date,nowIso))
   return deny(res,403,"COLLECTION_WINDOW_CLOSED",{flight_date:date});
  await reserve(sql,today,LOOKUP_RESERVATION_MILLS,"lookup");
  // One page (<=15 results), exact flight/date/airports matched; NEVER use historical or Europe endpoints.
  const resp=await aero("/flights/AAL1776",{
   start:date+"T00:00:00Z",end:new Date(Date.parse(date+"T00:00:00Z")+86400000).toISOString(),
   max_pages:1
  });
  const selected=selectAA1776(resp.flights||[],date);
  if(!selected.ok){
   await mark(sql,date,"PENDING_SOURCE",selected.error);
   return deny(res,202,"PENDING_SOURCE",{reason:selected.error,flight_date:date});
  }
  const f=selected.flight,decision=saleDecision(f,nowIso);
  if(decision!=="CHECK_ROUTE"){
   await mark(sql,date,decision,decision,f.fa_flight_id);
   return deny(res,decision==="DEPARTED"||decision==="CANCELLED"?409:202,decision,
    {sale_state:decision,sellable:false,flight_date:date});
  }
  await reserve(sql,today,ROUTE_RESERVATION_MILLS,"route");
  const route=await aero("/flights/"+encodeURIComponent(f.fa_flight_id)+"/route");
  const protocol=canonicalize(route.fixes||[]);
  if(!routeValid(protocol)){
   await mark(sql,date,"PENDING_ROUTE","NO_GENUINE_FILED_ROUTE",f.fa_flight_id);
   return deny(res,202,"PENDING_ROUTE",{flight_date:date,sellable:false});
  }
  let derived;
  try{derived=packageFromLive(f,protocol,nowIso,date);}
  catch(e){
   const reason=String(e?.message||"PACKAGE_INCOMPLETE").slice(0,100);
   await mark(sql,date,"PENDING_SOURCE",reason,f.fa_flight_id);
   return deny(res,202,"PENDING_SOURCE",{flight_date:date,reason});
  }
  // One-flight, short-lived derived-payload relay for the Chester-only API.
  // The US provider response and raw filed-route JSON never enter the database.
  // No 7-day store: the relay expires by midnight UTC on this SAME date, always <12 hours.
  const expiryMs=Math.min(Date.parse(date+"T00:00:00Z")+86400000,Date.parse(nowIso)+12*3600000);
  const expiresAt=new Date(expiryMs).toISOString();
  const stored=await sql`insert into aa1776_planb_relay
   (flight_date,fa_flight_id,source_captured_at,scheduled_out,expires_at,package_json)
   values(${date}::date,${f.fa_flight_id},${nowIso}::timestamptz,${f.scheduled_out}::timestamptz,
    ${expiresAt}::timestamptz,${JSON.stringify(derived)}::jsonb)
   on conflict(flight_date) do update set
    fa_flight_id=excluded.fa_flight_id,source_captured_at=excluded.source_captured_at,
    scheduled_out=excluded.scheduled_out,expires_at=excluded.expires_at,
    package_json=excluded.package_json,updated_at=now()
   returning flight_date,expires_at`;
  if(stored.length!==1)throw Error("DERIVED_RELAY_WRITE_FAILED");
  await mark(sql,date,"READY","GENUINE_ROUTE_VALIDATED",f.fa_flight_id);
  if(mode==="check")return json(res,200,{ok:true,status:"READY",flight_date:date,flight_id:f.fa_flight_id,
   package_schema:derived.schema,source_captured_at:nowIso,delivery:"on_demand_no_package_store"});
  // Finished derived package, on demand, without storing raw response or flight tracks.
  return json(res,200,derived);
 }catch(e){
  const code=String(e?.message||"CHECK_FAILED");
  const status=e?.httpStatus||((e?.status>=400&&e?.status<500)?502:500);
  // Do not log raw provider responses, authorisation material or sensitive headers.
  return deny(res,status,code.startsWith("DAILY_COST_CAP")?"DAILY_COST_CAP_REACHED":"AA1776_CHECK_FAILED");
 }
}
