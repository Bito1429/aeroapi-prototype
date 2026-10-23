import {neon} from '@neondatabase/serverless';
import {aero,json} from './lib.js';
const IDS=[["EXS251-1788592641-airline-213p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1788764603-schedule-1893p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1788847948-airline-819p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1789109561-airline-1510p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1789197609-schedule-1528p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1789366865-airline-1063p","EXS|EXS251|EGNM|LPFR","TRAIN"],["EXS251-1789454043-airline-42p","EXS|EXS251|EGNM|LPFR","EVAL"],["EXS251-1790060021-schedule-972p","EXS|EXS251|EGNM|LPFR","EVAL"],["EXS251-1790402202-airline-1838p","EXS|EXS251|EGNM|LPFR","EVAL"],["EZY7889-1788411689-airline-1485p","EZY|EZY7889|EHAM|LEMG","TRAIN"]];
export default async function handler(req,res){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'unauthorized'});
 const sql=neon(process.env.EUROPE_DATABASE_URL);
 await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:track_pilot','PENDING','{}'::jsonb) on conflict(task_key) do nothing`;
 const [lease]=await sql`update europe_feasibility_progress set status='RUNNING',updated_at=now() where task_key='ops:track_pilot' and status='PENDING' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'pilot already running or complete'});
 let attempts=0,stored=0,errors=[];
 try{
  const before=await aero('/account/usage',{}).catch(e=>({error:e.message}));
  await sql`update europe_feasibility_progress set detail=detail||${JSON.stringify({usage_before:before,started_at:new Date().toISOString()})}::jsonb where task_key='ops:track_pilot'`;
  const [e]=await sql`select coalesce(sum(page_count),0)::int pages from europe_feasibility_progress where task_key like 'enum:%'`;
  if(e.pages*.02+10*.06>=425)throw Error('Study budget guard');
  for(const [id,route,role] of IDS){
   const t=await sql`select 1 from europe_feasibility_tracks where fa_flight_id=${id}`;
   if(t.length)continue;
   attempts++;
   try{
    const body=await aero('/history/flights/'+encodeURIComponent(id)+'/track');
    const pts=(body.positions||body.track||[]).map(p=>({latitude:Number(p.latitude),longitude:Number(p.longitude),t:typeof p.timestamp==='number'?(p.timestamp>1e12?p.timestamp:p.timestamp*1000):Date.parse(p.timestamp)})).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Number.isFinite(p.t)).sort((a,b)=>a.t-b.t);
    if(pts.length<2)throw Error('fewer than 2 timestamped points');
    await sql`insert into europe_feasibility_tracks(fa_flight_id,route_key,role,point_count,actual_distance,points) values(${id},${route},${role},${pts.length},${body.actual_distance??null},${JSON.stringify(pts)}::jsonb) on conflict(fa_flight_id) do nothing`;
    stored++;
   }catch(err){errors.push({id,error:err.message,status:err.status||null})}
   await new Promise(r=>setTimeout(r,250));
  }
  const after=await aero('/account/usage',{}).catch(e=>({error:e.message}));
  await sql`update europe_feasibility_progress set status='DONE',detail=detail||${JSON.stringify({attempts,stored,errors,usage_after:after,finished_at:new Date().toISOString()})}::jsonb,updated_at=now() where task_key='ops:track_pilot'`;
  return json(res,200,{ok:true,attempts,stored,errors});
 }catch(err){await sql`update europe_feasibility_progress set status='ERROR',detail=detail||${JSON.stringify({error:err.message,attempts,stored,errors})}::jsonb,updated_at=now() where task_key='ops:track_pilot'`;return json(res,500,{ok:false,error:err.message,attempts,stored})}
}