import{captureFlight,flightById,json}from"./lib.js";
import{db}from"./db.js";

const STUDY_VERSION="RF-2026-10-08-v1";
const MAX_SAMPLE=40;
const ENROL_MIN_H=11;
const ENROL_MAX_H=25;
const MAX_PER_ORIGIN=3;
const CONCURRENCY=20;

async function enroll(sql,now){
  const countRows=await sql`select count(*)::int n from route_filing_study_flights where study_version=${STUDY_VERSION}`;
  let total=countRows[0]?.n||0;
  if(total>=MAX_SAMPLE)return{added:0,total};
  const start=new Date(now.getTime()+ENROL_MIN_H*3600000),end=new Date(now.getTime()+ENROL_MAX_H*3600000);
  const existing=await sql`select origin,count(*)::int n from route_filing_study_flights where study_version=${STUDY_VERSION} group by origin`;
  const perOrigin=new Map(existing.map(r=>[r.origin,r.n]));
  const candidates=await sql`select fa_flight_id,ident,origin,destination,scheduled_out_initial as scheduled_out
    from flight_jobs
    where created_at>=timestamp '2026-10-07 00:00:00+00'
      and origin like 'K%' and destination like 'K%'
      and scheduled_out_initial>=${start.toISOString()}::timestamptz
      and scheduled_out_initial<${end.toISOString()}::timestamptz
    order by scheduled_out_initial asc`;
  const bins=[[],[],[],[]],span=(ENROL_MAX_H-ENROL_MIN_H)/4;
  for(const r of candidates){
    const lead=(new Date(r.scheduled_out).getTime()-now.getTime())/3600000;
    const i=Math.max(0,Math.min(3,Math.floor((lead-ENROL_MIN_H)/span)));
    bins[i].push(r);
  }
  let added=0,progress=true;
  while(total<MAX_SAMPLE&&progress){
    progress=false;
    for(const bin of bins){
      if(total>=MAX_SAMPLE)break;
      let pickIndex=-1;
      for(let i=0;i<bin.length;i++){
        if((perOrigin.get(bin[i].origin)||0)<MAX_PER_ORIGIN){pickIndex=i;break;}
      }
      if(pickIndex<0)continue;
      const [r]=bin.splice(pickIndex,1);
      const ins=await sql`insert into route_filing_study_flights(study_version,fa_flight_id,ident,origin,destination,scheduled_out)
        values(${STUDY_VERSION},${r.fa_flight_id},${r.ident||null},${r.origin},${r.destination},${r.scheduled_out}::timestamptz)
        on conflict(fa_flight_id) do nothing returning id`;
      if(ins.length){
        perOrigin.set(r.origin,(perOrigin.get(r.origin)||0)+1);
        added++;total++;progress=true;
      }
    }
  }
  return{added,total,eligible_candidates:candidates.length,window:[start.toISOString(),end.toISOString()]};
}

async function observeOne(sql,row){
  const checkedAt=new Date();
  try{
    let f,routePresent,route,decodable=null;
    if(!row.first_decodable_at){
      const c=await captureFlight(row.fa_flight_id);
      f=c.flight;
      route=String(f.route||"").trim();
      routePresent=route.length>0;
      decodable=routePresent&&c.protocol?.baseline_valid===true&&(c.protocol?.canonical_fix_count||0)>=2;
    }else{
      f=await flightById(row.fa_flight_id);
      route=String(f.route||"").trim();
      routePresent=route.length>0;
    }
    const firstCheck=!row.first_checked_at;
    const firstRoute=String(row.first_route_text||"").trim();
    const changed=Boolean(routePresent&&firstRoute&&route!==firstRoute);
    const cancelled=/cancel/i.test(String(f.status||""));
    await sql`insert into route_filing_study_observations(study_flight_id,checked_at,route_present,route_text,route_decodable,actual_off,status_seen)
      values(${row.id},${checkedAt.toISOString()}::timestamptz,${routePresent},${route||null},${decodable},${f.actual_off||null}::timestamptz,${f.status||null})`;
    await sql`update route_filing_study_flights set
      first_checked_at=coalesce(first_checked_at,${checkedAt.toISOString()}::timestamptz),
      first_route_seen_at=case when first_route_seen_at is null and ${routePresent} then ${checkedAt.toISOString()}::timestamptz else first_route_seen_at end,
      first_route_text=case when first_route_text is null and ${routePresent} then ${route||null} else first_route_text end,
      route_available_at_first_check=case when route_available_at_first_check is null and ${firstCheck} then ${routePresent} else route_available_at_first_check end,
      first_decodable_at=case when first_decodable_at is null and ${decodable===true} then ${checkedAt.toISOString()}::timestamptz else first_decodable_at end,
      first_decodable_route_text=case when first_decodable_route_text is null and ${decodable===true} then ${route||null} else first_decodable_route_text end,
      final_route_text=case when ${routePresent} then ${route||null} else final_route_text end,
      first_route_changed_at=case when first_route_changed_at is null and ${changed} then ${checkedAt.toISOString()}::timestamptz else first_route_changed_at end,
      actual_off=coalesce(actual_off,${f.actual_off||null}::timestamptz),
      status=case when ${!!f.actual_off} then 'COMPLETE' when ${cancelled} then 'CANCELLED' else status end,
      terminal_reason=case when ${!!f.actual_off} then 'actual_off observed' when ${cancelled} then 'cancelled before actual_off' else terminal_reason end
      where id=${row.id}`;
    return{ok:true,id:row.id,flight:row.fa_flight_id,route_present:routePresent,route_decodable:decodable,route_changed_from_first:changed,actual_off:f.actual_off||null};
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
  for(let i=0;i<active.length;i+=CONCURRENCY)events.push(...await Promise.all(active.slice(i,i+CONCURRENCY).map(r=>observeOne(sql,r))));
  await sql`update route_filing_study_flights set status='EXPIRED',terminal_reason='no actual_off observed by scheduled_out + 6h'
    where study_version=${STUDY_VERSION} and status='ACTIVE' and scheduled_out<=now()-interval '6 hours'`;
  const summary=await sql`select count(*)::int total,
      count(*) filter(where first_checked_at is not null)::int checked,
      count(*) filter(where route_available_at_first_check is true)::int route_at_first_check,
      count(*) filter(where first_route_seen_at is not null)::int route_seen,
      count(*) filter(where first_decodable_at is not null)::int decodable_seen,
      count(*) filter(where first_route_text is not null and final_route_text is not null and first_route_text=final_route_text)::int first_matches_final,
      count(*) filter(where first_route_changed_at is not null)::int route_changed,
      count(*) filter(where status='COMPLETE')::int complete,
      count(*) filter(where status='CANCELLED')::int cancelled,
      count(*) filter(where status='EXPIRED')::int expired
    from route_filing_study_flights where study_version=${STUDY_VERSION}`;
  json(res,200,{ok:true,study_version:STUDY_VERSION,protocol:{
    frozen_at:"2026-10-08 before first study row",
    population:"US domestic flights already registered by the continuous campaign; same 20 major origins and mainstream scheduled-carrier population. Coverage includes East Coast early mornings from 10:00 UTC but not West Coast departures before about 09:00 local.",
    pilot:"40-flight pilot; threshold estimates are exploratory and must report their denominators. Rough binomial uncertainty is on the order of +/-15 percentage points at n=40 and wider for smaller threshold subsets.",
    sample:"40 flights; maximum 3 per origin; balanced across four scheduled-departure lead-time bins from 11 to 25 hours",
    enrolment_window_hours_before_scheduled_out:[ENROL_MIN_H,ENROL_MAX_H],
    observation_cadence:"hourly Vercel cron",
    first_route_rule:"first non-empty AeroAPI flight.route observed; never infer an earlier filing time",
    left_censor_rule:"if route is present at first check, only claim it was available by that check time",
    route_change_rule:"compare first non-empty route with the last non-empty route observed before completion; report match yes/no and the first observation time at which a different non-empty route appears",
    decodable_rule:"secondary measure is first observation at which the route is non-empty and the existing route-resolution path returns at least two fixes with complete coordinates",
    reporting:"lead time to actual_off when available; for 24h/12h/6h/3h/2h/90m availability, each threshold reports both numerator and eligible denominator and uses only flights first observed early enough to assess that threshold; cancellations and missing actual_off excluded from lead-time denominator. The 24h denominator may be small because enrolment follows the 22:05 UTC campaign registrar."
  },enrol,summary:summary[0],observed_this_run:events.length,errors:events.filter(x=>!x.ok).slice(0,10)});
}catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null})}}