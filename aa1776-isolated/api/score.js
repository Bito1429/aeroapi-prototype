// Isolated AA1776 postflight scoring. No provider access until a confirmed landing gate exists.
// Exactly one atomic, non-refundable track-request reservation per flight. Never persist a provider response.
import{timingSafeEqual}from"node:crypto";
import{db}from"../lib/db.js";
import{aero,json}from"../lib/lib.js";
import{scoreTrack,SCORE_RESERVATION_MILLS}from"../lib/aa1776-score.js";
import{MAX_DAILY_RESERVED_MILLS,MAX_DAILY_PROVIDER_REQUESTS}from"../lib/aa1776-policy.js";
function authorized(req){
 const a=String(req.headers?.authorization||"");
 const token=a.startsWith("Bearer ")?a.slice(7):"";
 const expected=process.env.CRON_SECRET||"";
 const x=Buffer.from(token),y=Buffer.from(expected);
 return !!expected&&String(req.headers?.["user-agent"]||"").startsWith("vercel-cron/")&&x.length===y.length&&timingSafeEqual(x,y);
}
const SAFE_ERRORS=new Set(["INVALID_FROZEN_TIMING","INVALID_FROZEN_PACKAGE","INVALID_BASELINE","TRACK_INCOMPLETE","TRACK_ID_MISMATCH","TRACK_NOT_TERMINATED","SCORE_INVALID","INVALID_FROZEN_WINDOW"]);
export default async function handler(req,res){
 res.setHeader("cache-control","private,no-store");
 if(req.method!=="GET"||process.env.VERCEL_ENV!=="production"||(process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROJECT_ID!=="prj_mJqs74AzbbyLmGrdmZc4Pek9knpK"))return json(res,403,{error:"PRODUCTION_CRON_ONLY"});
 if(!authorized(req))return json(res,401,{error:"UNAUTHORIZED"});
 const today=new Date().toISOString().slice(0,10);
 if(!["2026-11-25","2026-11-26","2026-11-27"].includes(today))return json(res,403,{error:"SCORE_DATE_CLOSED"});
 let sql,flightDate=null,stage="DATABASE";
 try{
  sql=db();
  const ctl=await sql`select enabled from aa1776_planb_isolated_control where id=1`;
  if(!ctl[0]?.enabled||!process.env.AEROAPI_KEY)return json(res,200,{ok:true,skipped:"COLLECTOR_DISABLED_OR_KEY_MISSING",provider_calls:0});
  // The score gate is written only by engineering after actual landing confirmation from public evidence.
  // Claim and actual UTC-day reservation happen atomically; flight-date limits are also checked.
  // Lock candidate rows; a crashed/failed claim is terminal and is NEVER retried.
  stage="CLAIM";
  const claimed=await sql`with candidate as (
    select s.flight_date from aa1776_planb_scores s
    join aa1776_planb_relay r on r.flight_date=s.flight_date and r.fa_flight_id=s.fa_flight_id
    join aa1776_planb_state st on st.flight_date=s.flight_date and st.state='READY'
    join aa1776_planb_budget b on b.usage_date=s.flight_date
    where s.state='CONFIRMED' and s.flight_date in (date '2026-11-24',date '2026-11-25',date '2026-11-26')
     and s.actual_on<=now()-interval '10 minutes' and s.actual_off>r.source_captured_at
     and r.expires_at>now()
     and b.request_count<${MAX_DAILY_PROVIDER_REQUESTS} and b.reserved_mills+${SCORE_RESERVATION_MILLS}<=${MAX_DAILY_RESERVED_MILLS}
    order by s.flight_date limit 1 for update of s skip locked
   ), claim as (
    update aa1776_planb_scores s set state='CLAIMED',claimed_at=now(),request_date=${today}::date,reserved_mills=${SCORE_RESERVATION_MILLS}
    from candidate c where s.flight_date=c.flight_date and s.state='CONFIRMED'
    returning s.flight_date,s.fa_flight_id,s.actual_off,s.actual_on
   ), reservation as (
    insert into aa1776_planb_budget(usage_date,reserved_mills,request_count)
    select ${today}::date,${SCORE_RESERVATION_MILLS},1 from claim where true
    on conflict(usage_date) do update set
     reserved_mills=aa1776_planb_budget.reserved_mills+excluded.reserved_mills,
     request_count=aa1776_planb_budget.request_count+1,updated_at=now()
    where aa1776_planb_budget.request_count<${MAX_DAILY_PROVIDER_REQUESTS}
     and aa1776_planb_budget.reserved_mills+excluded.reserved_mills<=${MAX_DAILY_RESERVED_MILLS}
    returning usage_date
   )
   select c.*,r.package_json,exists(select 1 from reservation) as reserved
   from claim c join aa1776_planb_relay r on r.flight_date=c.flight_date and r.fa_flight_id=c.fa_flight_id`;
  if(!claimed.length)return json(res,200,{ok:true,skipped:"NO_ELIGIBLE_CONFIRMED_LANDING",provider_calls:0});
  const c=claimed[0];flightDate=String(c.flight_date instanceof Date?c.flight_date.toISOString():c.flight_date).slice(0,10);
  if(!c.reserved){
   await sql`update aa1776_planb_scores set state='CAP_BLOCKED',reserved_mills=0,error_code='ACTUAL_DAY_CAP' where flight_date=${flightDate}::date and state='CLAIMED'`;
   return json(res,200,{ok:true,skipped:"ACTUAL_DAY_CAP",provider_calls:0});
  }
  stage="TRACK";
  let payload=null,scores;
  try{
   payload=await aero("/flights/"+encodeURIComponent(c.fa_flight_id)+"/track");
   stage="SCORE";
   scores=scoreTrack(c.package_json,payload,c.actual_off,c.actual_on);
  }finally{payload=null;}
  stage="STORE_SCORE";
  await sql`update aa1776_planb_scores set state='SCORED',scored_at=now(),score_json=${JSON.stringify(scores)}::jsonb where flight_date=${flightDate}::date and state='CLAIMED'`;
  return json(res,200,{ok:true,state:"SCORED",flight_date:flightDate,provider_calls:1});
 }catch(e){
  const code=SAFE_ERRORS.has(e?.message)?e.message:stage+"_ERROR";
  if(sql&&flightDate){try{await sql`update aa1776_planb_scores set state='FAILED',error_code=${code} where flight_date=${flightDate}::date and state='CLAIMED'`;}catch{}}
  // Never log exception objects, provider bodies, coordinates or keys.
  console.error("AA1776_SCORE_FAILED",code);
  return json(res,500,{error:code});
 }
}
