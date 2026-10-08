import{aero,flightById,json}from"./lib.js";
import{db}from"./db.js";

const STUDY_VERSION="RF-2026-10-08-v1";
const AIRPORTS=["KATL","KDFW","KDEN","KORD","KLAX","KCLT","KLAS","KPHX","KMCO","KSEA","KIAH","KJFK","KEWR","KBOS","KMSP","KDTW","KSLC","KBWI","KPHL","KSFO"];
const CARRIERS=new Set(["AAL","DAL","UAL","SWA","ASA","JBU","FFT","NKS","HAL","AAY","SCX","SKW","RPA","EDV","JIA","ENY","PDT","GJS","ASH","MXY","VXP"]);
const MAX_SAMPLE=40;
const PER_ORIGIN=2;
const ENROL_START_H=23;
const ENROL_END_H=25;
const MAX_PAGES=2;
const CONCURRENCY=20;

const code=x=>x?.code_icao||x?.code||x||"";
const carrierOf=f=>String(f.ident||f.ident_icao||"").match(/^([A-Z]{3})/)?.[1]||"";
const iso=d=>new Date(d).toISOString();

async function enroll(sql,now){
  const countRows=await sql`select count(*)::int n from route_filing_study_flights where study_version=${STUDY_VERSION}`;
  let total=countRows[0]?.n||0;
  if(total>=MAX_SAMPLE)return{added:0,total};
  const start=new Date(now.getTime()+ENROL_START_H*3600000),end=new Date(now.getTime()+ENROL_END_H*3600000);
  const existing=await sql`select origin,count(*)::int n from route_filing_study_flights where study_version=${STUDY_VERSION} group by origin`;
  const perOrigin=new Map(existing.map(r=>[r.origin,r.n]));
  let added=0;
  for(const ap of AIRPORTS){
    if(total>=MAX_SAMPLE)break;
    const need=Math.max(0,PER_ORIGIN-(perOrigin.get(ap)||0));
    if(!need)continue;
    let b;
    try{
      b=await aero(`/airports/${ap}/flights/scheduled_departures`,{start:start.toISOString(),end:end.toISOString(),max_pages:MAX_PAGES});
    }catch{continue;}
    const candidates=(b.scheduled_departures||b.flights||[])
      .filter(f=>f.fa_flight_id&&f.scheduled_out&&code(f.origin)===ap&&code(f.destination).startsWith("K")&&CARRIERS.has(carrierOf(f))&&carrierOf(f)!=="KAP"&&!/cancel/i.test(String(f.status||"")))
      .sort((a,b)=>new Date(a.scheduled_out)-new Date(b.scheduled_out));
    let used=0;
    for(const f of candidates){
      if(used>=need||total>=MAX_SAMPLE)break;
      const rows=await sql`insert into route_filing_study_flights(study_version,fa_flight_id,ident,origin,destination,scheduled_out)
        values(${STUDY_VERSION},${f.fa_flight_id},${f.ident||null},${code(f.origin)},${code(f.destination)},${f.scheduled_out}::timestamptz)
        on conflict(fa_flight_id) do nothing returning id`;
      if(rows.length){used++;added++;total++;}
    }
    perOrigin.set(ap,(perOrigin.get(ap)||0)+used);
  }
  return{added,total,window:[start.toISOString(),end.toISOString()]};
}

async function observeOne(sql,row){
  const checkedAt=new Date();
  try{
    const f=await flightById(row.fa_flight_id);
    const route=String(f.route||"").trim();
    const routePresent=route.length>0;
    await sql`insert into route_filing_study_observations(study_flight_id,checked_at,route_present,route_text,actual_off,status_seen)
      values(${row.id},${checkedAt.toISOString()}::timestamptz,${routePresent},${route||null},${f.actual_off||null}::timestamptz,${f.status||null})`;
    const firstCheck=!row.first_checked_at;
    await sql`update route_filing_study_flights set
      first_checked_at=coalesce(first_checked_at,${checkedAt.toISOString()}::timestamptz),
      first_route_seen_at=case when first_route_seen_at is null and ${routePresent} then ${checkedAt.toISOString()}::timestamptz else first_route_seen_at end,
      first_route_text=case when first_route_text is null and ${routePresent} then ${route||null} else first_route_text end,
      route_available_at_first_check=case when route_available_at_first_check is null and ${firstCheck} then ${routePresent} else route_available_at_first_check end,
      actual_off=coalesce(actual_off,${f.actual_off||null}::timestamptz),
      status=case when ${!!f.actual_off} then 'COMPLETE' when ${/cancel/i.test(String(f.status||""))} then 'CANCELLED' else status end,
      terminal_reason=case when ${!!f.actual_off} then 'actual_off observed' when ${/cancel/i.test(String(f.status||""))} then 'cancelled before actual_off' else terminal_reason end
      where id=${row.id}`;
    return{ok:true,id:row.id,flight:row.fa_flight_id,route_present:routePresent,actual_off:f.actual_off||null};
  }catch(e){
    return{ok:false,id:row.id,flight:row.fa_flight_id,error:String(e?.message||e)};
  }
}

export default async function handler(req,res){try{
  const sql=db(),now=new Date();
  const enrol=await enroll(sql,now);
  const active=await sql`select * from route_filing_study_flights
    where study_version=${STUDY_VERSION} and status='ACTIVE'
      and scheduled_out > now()-interval '6 hours'
    order by scheduled_out asc`;
  const events=[];
  for(let i=0;i<active.length;i+=CONCURRENCY){
    const settled=await Promise.all(active.slice(i,i+CONCURRENCY).map(r=>observeOne(sql,r)));
    events.push(...settled);
  }
  await sql`update route_filing_study_flights set status='EXPIRED',terminal_reason='no actual_off observed by scheduled_out + 6h'
    where study_version=${STUDY_VERSION} and status='ACTIVE' and scheduled_out<=now()-interval '6 hours'`;
  const summary=await sql`select
      count(*)::int total,
      count(*) filter(where first_checked_at is not null)::int checked,
      count(*) filter(where route_available_at_first_check is true)::int route_at_first_check,
      count(*) filter(where first_route_seen_at is not null)::int route_seen,
      count(*) filter(where status='COMPLETE')::int complete,
      count(*) filter(where status='CANCELLED')::int cancelled,
      count(*) filter(where status='EXPIRED')::int expired
    from route_filing_study_flights where study_version=${STUDY_VERSION}`;
  json(res,200,{ok:true,study_version:STUDY_VERSION,protocol:{
    population:"US domestic; same 20 major origins and mainstream scheduled carrier set as continuous campaign; Cape Air/KAP excluded",
    sample:"40 flights; maximum 2 per origin",
    enrolment_window_hours_before_scheduled_out:[ENROL_START_H,ENROL_END_H],
    observation_cadence:"hourly Vercel cron",
    first_route_rule:"first non-empty AeroAPI flight.route observed; never infer an earlier filing time",
    left_censor_rule:"if route is present at first check, only claim it was available by that check time",
    reporting:"lead time to actual_off when available; shares available by 24h/12h/6h/3h/2h/90m; cancellations and missing actual_off excluded from lead-time denominator"
  },enrol,summary:summary[0],observed_this_run:events.length,errors:events.filter(x=>!x.ok).slice(0,10)});
}catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null})}}