import {neon} from '@neondatabase/serverless';
import {aero,json} from './lib.js';
import {score} from './europe-feasibility-batch.js';
const R='RYR|RYR336|LCPH|LGAV',REPLACEMENT='EZY|EZY2118|LFPG|EGCC';
export default async function handler(req,res){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'unauthorized'});
 const sql=neon(process.env.EUROPE_DATABASE_URL);
 await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:retry_502','PENDING','{}'::jsonb) on conflict(task_key) do nothing`;
 const [lease]=await sql`update europe_feasibility_progress set status='RUNNING',updated_at=now() where task_key='ops:retry_502' and status='PENDING' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'already running or done'});
 let stored=0;
 try{
  const candidates=await sql`with ranked as(select f.fa_flight_id,f.scheduled_out,row_number() over(order by f.scheduled_out desc,f.fa_flight_id desc) rn from europe_feasibility_flights f join europe_feasibility_progress p on p.task_key='enum:'||to_char(f.source_day,'YYYY-MM-DD')||':RYR' and p.status='DONE' where f.operator_icao='RYR' and f.ident='RYR336' and f.origin='LCPH' and f.destination='LGAV') select fa_flight_id from ranked where rn<=9 order by scheduled_out asc`;
  if(candidates.length!==9)throw Error('missing nine frozen RYR336 occurrences');
  for(const f of candidates){
   const found=await sql`select 1 from europe_feasibility_tracks where fa_flight_id=${f.fa_flight_id}`;
   if(found.length)continue;
   const [p]=await sql`select coalesce(sum(page_count),0)::int pages from europe_feasibility_progress where task_key like 'enum:%'`;
   const [n]=await sql`select coalesce(flight_count,0)::int n from europe_feasibility_progress where task_key='budget:track_requests'`;
   if(p.pages*.02+(n?.n??0)*.06+10*.06+.06>=425)throw Error('budget ceiling');
   const body=await aero('/history/flights/'+encodeURIComponent(f.fa_flight_id)+'/track');
   const pts=(body.positions||body.track||[]).map(q=>({latitude:Number(q.latitude),longitude:Number(q.longitude),t:typeof q.timestamp==='number'?(q.timestamp>1e12?q.timestamp:q.timestamp*1000):Date.parse(q.timestamp)})).filter(q=>Number.isFinite(q.latitude)&&Number.isFinite(q.longitude)&&Number.isFinite(q.t)).sort((a,b)=>a.t-b.t);
   await sql`update europe_feasibility_progress set flight_count=flight_count+1 where task_key='budget:track_requests'`;
   if(pts.length<2)throw Error('track incomplete');
   const ix=candidates.findIndex(x=>x.fa_flight_id===f.fa_flight_id);
   await sql`insert into europe_feasibility_tracks(fa_flight_id,route_key,role,point_count,actual_distance,points) values(${f.fa_flight_id},${R},${ix<6?'TRAIN':'EVAL'},${pts.length},${body.actual_distance??null},${JSON.stringify(pts)}::jsonb) on conflict(fa_flight_id) do nothing`;
   stored++;
   await new Promise(z=>setTimeout(z,250));
  }
  const [check]=await sql`select count(*)::int n from europe_feasibility_tracks where route_key=${R}`;
  if(check.n!==9)throw Error('cannot restore incomplete RYR336');
  await sql`with drop_old as(update europe_feasibility_routes set selected=false,status='CANDIDATE',selection_rank=null,updated_at=now() where route_key=${REPLACEMENT} and selected=true returning route_key) update europe_feasibility_routes set selected=true,status='SELECTED',reject_reason=null,selection_rank=15,updated_at=now() where route_key=${R} and (select count(*) from drop_old)=1`;
  const result=await score(sql,true);
  await sql`update europe_feasibility_progress set status='DONE',detail=detail||${JSON.stringify({stored,corrected_result_id:result.id})}::jsonb,updated_at=now() where task_key='ops:retry_502'`;
  return json(res,200,{ok:true,stored,corrected_result_id:result.id});
 }catch(e){
   await sql`update europe_feasibility_progress set status='ERROR',detail=detail||${JSON.stringify({error:e.message,stored})}::jsonb,updated_at=now() where task_key='ops:retry_502'`;
   return json(res,500,{ok:false,error:e.message,stored});
 }
}