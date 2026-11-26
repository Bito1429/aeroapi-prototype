// Isolated AA1776 Plan B: US paid AeroAPI only; test-only; no raw data persisted.
// Entry points: Vercel cron (mode=check) and Chester key (mode=package/status).
// There are no changes to the 250-flight/day cohort or European trial.
import{timingSafeEqual}from"node:crypto";
import{aero,flightView,canonicalize,json}from"../lib/lib.js";
import{db}from"../lib/db.js";
import{etaPackage,aa1776Timing}from"../lib/eta-calibration.js";
import{modelFiledTimeline}from"../lib/filed-timeline.js";
import{toChesterV1}from"../lib/chester-schema.js";
import{inCollectionWindow,isTargetDate,selectAA1776,saleDecision,routeValid,LOOKUP_RESERVATION_MILLS,ROUTE_RESERVATION_MILLS,MAX_DAILY_RESERVED_MILLS,MAX_DAILY_PROVIDER_REQUESTS,paidCheckDecision,aa1776PackageExpiresAt,refreshDecision}from"../lib/aa1776-policy.js";

function equalSecret(provided,expected){
 if(!expected||typeof provided!=="string")return false;
 const a=Buffer.from(provided),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function authorized(req){
 const auth=String(req.headers?.authorization||"");
 const cron=auth.startsWith("Bearer ")?auth.slice(7):"";
 return String(req.headers?.["user-agent"]||"").startsWith("vercel-cron/") && equalSecret(cron,process.env.CRON_SECRET);
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
 and aa1776_planb_budget.request_count<${MAX_DAILY_PROVIDER_REQUESTS-(date==="2026-11-26"?2:1)}
 returning reserved_mills,request_count`;
 if(!rows.length)throw Object.assign(Error("DAILY_BUDGET_OR_REQUEST_CAP_REACHED"),{httpStatus:429});
 return rows[0]; // Reserve even on provider errors (never refund).
}
async function mark(sql,date,state,code,flightId=null){
 // Only derived status/identity metadata: no provider payload, route text or raw tracks.
 await sql`insert into aa1776_planb_state(flight_date,state,reason,fa_flight_id,last_checked_at,ready_at)
 values(${date}::date,${state},${code},${flightId},now(),case when ${state}='READY' then now() else null end)
 on conflict(flight_date) do update set
 state=excluded.state,reason=excluded.reason,fa_flight_id=excluded.fa_flight_id,last_checked_at=now(),
 ready_at=coalesce(aa1776_planb_state.ready_at,excluded.ready_at)`;
}
// Validate required provider fields before spending on the route endpoint.
export function checkFlightFields(f,flightDate){
 const flight=flightView(f);
 const timing=aa1776Timing(flight,flightDate);
 const fields={
  "flight.id":flight.fa_flight_id,
  "flight.ident_icao":flight.ident_icao,
  "flight.ident":flight.ident,
  "flight.scheduled_out":flight.scheduled_out,
  "flight.scheduled_arrival":flight.scheduled_on,
  "flight.estimated_out":flight.estimated_out,
  "flight.estimated_off":flight.estimated_off,
  [timing.historical?"flight.historical_airborne_duration":"flight.filed_ete"]:timing.seconds,
  "flight.airline":flight.airline?.code&&flight.airline?.name,
  "flight.aircraft_type":flight.aircraft_type
 };
 for(const [name,value] of Object.entries(fields))
  if(value===null||value===undefined||value===""||value===false)
   return {ok:false,reason:"CHESTER_REQUIRED_FIELD:"+name};
 for(const name of ["scheduled_out","scheduled_on","estimated_out","estimated_off"])
  if(!Number.isFinite(Date.parse(flight[name])))
   return {ok:false,reason:"CHESTER_REQUIRED_FIELD:flight."+name};
 if(!Number.isFinite(timing.seconds)||timing.seconds<=0)
  return {ok:false,reason:timing.historical?"CHESTER_REQUIRED_FIELD:flight.historical_airborne_duration":"CHESTER_REQUIRED_FIELD:flight.filed_ete"};
 for(const name of ["origin_airport","destination_airport"]){
  const a=flight[name];
  if(!a?.code_iata||!a?.code_icao||!a?.name||!a?.timezone||
     !Number.isFinite(a?.latitude)||!Number.isFinite(a?.longitude))
   return {ok:false,reason:"CHESTER_REQUIRED_FIELD:airport.metadata"};
 }
 return {ok:true};
}
export function packageFromLive(f,protocol,nowIso,flightDate){
 const validation=checkFlightFields(f,flightDate);
 if(!validation.ok)throw Object.assign(Error(validation.reason),{httpStatus:202});
 const flight=flightView(f);
 const estimatedOff=flight.estimated_off;
 const timing=aa1776Timing(flight,flightDate);
 const duration=timing.seconds;
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
  eta:etaPackage(timing.historical?{estimatedOff,historicalAirborneSeconds:duration}:{estimatedOff,filedEteSeconds:duration})
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
   (process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!=="prj_mJqs74AzbbyLmGrdmZc4Pek9knpK"))
  return deny(res,503,"US_PRODUCTION_ONLY");
 if(!authorized(req))return deny(res,401,"UNAUTHORIZED");
 const now=new Date(),nowIso=now.toISOString(),today=nowIso.slice(0,10);
 const mode="check";
 const date=today;
 if(!isTargetDate(date))return deny(res,403,"DATE_NOT_ALLOWED");
 let sql,stage="DATABASE",flightId=null,refresh=false,priorRow=null;
 try{
  sql=db();
  const ctl=await sql`select enabled from aa1776_planb_isolated_control where id=1`;
  if(!ctl[0])return deny(res,503,"CONTROL_MISSING");
  if(!ctl[0].enabled){
    const p=await sql`select has_table_privilege(current_user,'aa1776_planb_relay','INSERT,UPDATE') as relay_ok,has_table_privilege(current_user,'aa1776_planb_budget','INSERT,UPDATE') as budget_ok,has_table_privilege(current_user,'flight_jobs','SELECT') as campaign_read`;
    if(!p[0]?.relay_ok||!p[0]?.budget_ok||p[0]?.campaign_read)return deny(res,503,"DRY_RUN_PRIVILEGES_FAILED");
    await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'DRY_RUN_PASS','CRON_AND_DB_PERMISSIONS_OK')`;
    return json(res,200,{ok:true,dry_run:true,provider_calls:0,flight_date:date});
  }
  if(!process.env.AEROAPI_KEY)return deny(res,503,"US_PAID_AEROAPI_KEY_NOT_CONFIGURED");
  await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'CHECK_STARTED','VERCEL_CRON_AUTHENTICATED')`;
  // No scheduled/interactive calls on other days, outside narrow UTC windows,
  // or before the real flight can be captured within 24 hours of departure.
  if(today!==date||!inCollectionWindow(date,nowIso))
   return deny(res,403,"COLLECTION_WINDOW_CLOSED",{flight_date:date});
  const prior=await sql`select s.state,s.reason,s.last_checked_at,r.package_json,r.source_captured_at,r.fa_flight_id,r.scheduled_out from aa1776_planb_state s left join aa1776_planb_relay r using(flight_date) where s.flight_date=${date}::date`;
  priorRow=prior[0];
  refresh=date==="2026-11-26"&&!!priorRow?.package_json&&["READY","DEPARTED"].includes(priorRow.state);
  if(refresh&&(priorRow.reason==="ROUTE_FROZEN"||Date.parse(nowIso)>=Date.parse(priorRow.package_json.eta.departure.estimated_off)))return json(res,200,{ok:true,skipped:"ROUTE_FROZEN",provider_calls:0});
  // Score requests count against the actual UTC day but must not suppress the next flight 16:00 collection check.
  const budget=await sql`select b.request_count,(select count(*)::int from aa1776_planb_scores s where s.request_date=${today}::date and s.reserved_mills>0) as score_requests from aa1776_planb_budget b where b.usage_date=${today}::date`;
  const totalRequests=Number(budget[0]?.request_count||0);
  const collectionRequests=Math.max(0,totalRequests-Number(budget[0]?.score_requests||0));
  const retry=paidCheckDecision({state:prior[0]?.state,lastCheckedAt:prior[0]?.last_checked_at,now:nowIso,requestCount:collectionRequests,refresh});
  if(retry==="DAILY_REQUEST_CAP_REACHED")
   return deny(res,429,retry,{flight_date:date,provider_calls:0});
  if(retry!=="CHECK_ROUTE")
   return json(res,200,{ok:true,skipped:retry,state:prior[0]?.state,flight_date:date,provider_calls:0});
  if(refresh){
   const claimed=await sql`update aa1776_planb_state set last_checked_at=now() where flight_date=${date}::date and last_checked_at<=now()-interval '13 minutes' and state in ('READY','DEPARTED') and reason is distinct from 'ROUTE_FROZEN' returning flight_date`;
   if(!claimed.length)return json(res,200,{ok:true,skipped:"CHECK_ALREADY_CLAIMED",provider_calls:0});
  }
  stage="LOOKUP_RESERVATION";
  await reserve(sql,today,LOOKUP_RESERVATION_MILLS,"lookup");
  // One page (<=15 results), exact flight/date/airports matched; NEVER use historical or Europe endpoints.
  stage="PROVIDER_LOOKUP";
  const resp=await aero("/flights/AAL1776",{
   start:date+"T00:00:00Z",end:new Date(Date.parse(date+"T00:00:00Z")+86400000).toISOString(),
   max_pages:1
  });
  stage="FLIGHT_SELECTION";
  const selected=selectAA1776(resp.flights||[],date);
  if(!selected.ok){
   if(refresh)return rejectRefresh(sql,res,date,selected.error);
   await mark(sql,date,"PENDING_SOURCE",selected.error);
   return deny(res,202,"PENDING_SOURCE",{reason:selected.error,flight_date:date});
  }
  const f=selected.flight; flightId=f.fa_flight_id||null;
  stage="SALE_DECISION";
  if(refresh&&flightId!==priorRow.fa_flight_id)return rejectRefresh(sql,res,date,"FLIGHT_ID_CHANGED");
  // Internal Method A evidence, never part of the Chester package. Record before
  // route validation, even if the route request fails or take-off is confirmed.
  if(date==="2026-11-26"){
   stage="METHOD_A_OBSERVATION";
   const isoOrNull=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
   const filedEte=Number.isSafeInteger(f.filed_ete)&&f.filed_ete>0?f.filed_ete:null;
   const actualOff=isoOrNull(f.actual_off);
   const observation={kind:"METHOD_A_OBSERVATION",filed_ete_seconds:filedEte,estimated_off:isoOrNull(f.estimated_off),actual_off:actualOff&&Date.parse(actualOff)<=Date.parse(nowIso)?actualOff:null};
   await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'CHECK_STARTED',${JSON.stringify(observation)})`;
  }
  if(refresh){
   const rd=refreshDecision(f,nowIso);
   if(rd==="CANCELLED"||rd==="FROZEN"){
    await mark(sql,date,rd==="CANCELLED"?"CANCELLED":"DEPARTED",rd==="FROZEN"?"ROUTE_FROZEN":"CANCELLED",flightId);
    await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,${rd==="FROZEN"?"DEPARTED":"CANCELLED"},${rd})`;
    return deny(res,409,rd==="FROZEN"?"DEPARTED":"CANCELLED");
   }
   if(rd!=="CHECK_ROUTE")return rejectRefresh(sql,res,date,"INVALID_ESTIMATE");
   if(f.actual_out||Date.parse(nowIso)>=Date.parse(priorRow.scheduled_out))await mark(sql,date,"DEPARTED","GATE_DEPARTED",flightId);
  }
  const decision=refresh?"CHECK_ROUTE":saleDecision(f,nowIso);
  if(decision!=="CHECK_ROUTE"){
   await mark(sql,date,decision,decision,f.fa_flight_id);
   return deny(res,decision==="DEPARTED"||decision==="CANCELLED"?409:202,decision,
    {sale_state:decision,sellable:false,flight_date:date});
  }
  stage="FIELD_VALIDATION";
  const preflight=checkFlightFields(f,date);
  if(!preflight.ok){
   if(refresh)return rejectRefresh(sql,res,date,preflight.reason);
   await mark(sql,date,"PENDING_SOURCE",preflight.reason,f.fa_flight_id);
   return deny(res,202,"PENDING_SOURCE",{flight_date:date,reason:preflight.reason});
  }
  stage="ROUTE_RESERVATION";
  await reserve(sql,today,ROUTE_RESERVATION_MILLS,"route");
  stage="PROVIDER_ROUTE";
  const route=await aero("/flights/"+encodeURIComponent(f.fa_flight_id)+"/route");
  stage="ROUTE_VALIDATION";
  const protocol=canonicalize(route.fixes||[]);
  if(!routeValid(protocol)){
   if(refresh)return rejectRefresh(sql,res,date,"NO_GENUINE_FILED_ROUTE");
   await mark(sql,date,"PENDING_ROUTE","NO_GENUINE_FILED_ROUTE",f.fa_flight_id);
   return deny(res,202,"PENDING_ROUTE",{flight_date:date,sellable:false});
  }
  stage="PACKAGE_BUILD";
  let derived;
  try{derived=packageFromLive(f,protocol,nowIso,date);}
  catch(e){
   const reason=String(e?.message||"PACKAGE_INCOMPLETE").slice(0,100);
   if(refresh)return rejectRefresh(sql,res,date,reason);
   await mark(sql,date,"PENDING_SOURCE",reason,f.fa_flight_id);
   return deny(res,202,"PENDING_SOURCE",{flight_date:date,reason});
  }
  // One-flight, short-lived derived-payload relay for the Chester-only API.
  // The US provider response and raw filed-route JSON never enter the database.
  // No 7-day server store; derived relay expiry is same as package expiry.
  // Thursday remains available until scheduled arrival + 12 hours on Friday.
  if(refresh){
   const old=priorRow.package_json;
   const same=JSON.stringify(old.route.line)===JSON.stringify(derived.route.line)&&Date.parse(old.eta.departure.estimated_off)===Date.parse(derived.eta.departure.estimated_off)&&Date.parse(old.flight.estimated_out)===Date.parse(derived.flight.estimated_out);
   if(same){await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'REFRESH_UNCHANGED','PACKAGE_RETAINED')`;return json(res,200,{ok:true,status:"REFRESH_UNCHANGED",package_version:old.package_version});}
   const changed=await sql`update aa1776_planb_relay r set source_captured_at=${nowIso}::timestamptz,package_json=${JSON.stringify(derived)}::jsonb,expires_at=${derived.expires_at}::timestamptz,updated_at=now() where flight_date=${date}::date and fa_flight_id=${flightId} and source_captured_at=${priorRow.source_captured_at}::timestamptz and now()<least((r.package_json#>>'{eta,departure,estimated_off}')::timestamptz,${derived.eta.departure.estimated_off}::timestamptz) and exists(select 1 from aa1776_planb_state s where s.flight_date=r.flight_date and s.state in ('READY','DEPARTED') and s.reason is distinct from 'ROUTE_FROZEN') and r.scheduled_out=${f.scheduled_out}::timestamptz returning flight_date`;
   if(!changed.length)return rejectRefresh(sql,res,date,"ATOMIC_SWAP_GUARD");
   await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'REFRESH_CHANGED','VALIDATED_PACKAGE_REPLACED')`;
   return json(res,200,{ok:true,status:"REFRESH_CHANGED",package_version:derived.package_version});
  }
  const expiresAt=derived.expires_at;
  stage="RELAY_WRITE";
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
  stage="READY_STATE_WRITE";
  await mark(sql,date,"READY","GENUINE_ROUTE_VALIDATED",f.fa_flight_id);
  await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'READY','GENUINE_ROUTE_VALIDATED')`;
  if(true)return json(res,200,{ok:true,status:"READY",flight_date:date,flight_id:f.fa_flight_id,
   package_schema:derived.schema,source_captured_at:nowIso,delivery:"short_lived_derived_relay"});
  return deny(res,500,"CRON_ONLY");
 }catch(e){
  const code=String(e?.message||"CHECK_FAILED");
  const status=e?.httpStatus||((e?.status>=400&&e?.status<500)?502:500);
  // Only fixed stage labels and numeric HTTP status; never log error bodies/messages or keys.
  const providerStatus=Number.isInteger(e?.status)&&e.status>=400&&e.status<=599?e.status:null;
  const reason=stage+(providerStatus?"_HTTP_"+providerStatus:"_ERROR");
  console.error("AA1776_CHECK_FAILED",reason);
  if(sql&&!code.startsWith("DAILY_")){
   if(!refresh)try{await sql`update aa1776_planb_state set state='PENDING_SOURCE',reason=${reason},last_checked_at=now() where flight_date=${date}::date and state not in ('READY','DEPARTED','CANCELLED') and not exists(select 1 from aa1776_planb_relay where flight_date=${date}::date)`;}catch{}
   try{await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'CHECK_FAILED',${reason})`;}catch{}
  }
  return deny(res,status,code.startsWith("DAILY_")?code:"AA1776_CHECK_FAILED");
 }
}

async function rejectRefresh(sql,res,date,reason){await sql`insert into aa1776_planb_cron_runs(flight_date,phase,detail) values(${date}::date,'REFRESH_REJECTED',${reason})`;return json(res,200,{ok:true,status:"REFRESH_REJECTED",reason});}
