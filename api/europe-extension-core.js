import {neon} from '@neondatabase/serverless';
import {aero,json} from './lib.js';
import {scoreExtension} from './europe-feasibility-batch.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const db=()=>neon(process.env.EUROPE_DATABASE_URL);
async function usage(){try{return await aero('/account/usage',{})}catch(e){return {error:e.message}}}
async function reserve(sql){
 const [p]=await sql`select coalesce(sum(page_count),0)::int pages from europe_feasibility_progress where task_key like 'enum:%'`;
 const [old]=await sql`select coalesce(flight_count,0)::int n from europe_feasibility_progress where task_key='budget:track_requests'`;
 const [cur]=await sql`select coalesce(flight_count,0)::int n from europe_feasibility_progress where task_key='budget:extension_requests'`;
 const next=p.pages*.02+.06*(Number(old?.n||0)+10+Number(cur?.n||0)+1);
 if(next>425)throw Error('EUROPE_BUDGET_GUARD: estimated study spend would exceed $425');
 await sql`update europe_feasibility_progress set flight_count=flight_count+1,updated_at=now() where task_key='budget:extension_requests'`;
 return next;
}
function clean(body){return(body.positions||body.track||[]).map(x=>({latitude:Number(x.latitude),longitude:Number(x.longitude),t:typeof x.timestamp==='number'?(x.timestamp>1e12?x.timestamp:x.timestamp*1000):Date.parse(x.timestamp)})).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)&&Number.isFinite(x.t)).sort((a,b)=>a.t-b.t)}
async function work(sql,cap,deadline){
 let attempts=0,stored=0,rejections=[];
 for(const sector of ['short','medium']){
  while(Date.now()<deadline-4000 && attempts<cap){
   const [tot]=await sql`select count(*)::int n from europe_feasibility_extension_routes where sector=${sector} and status='SELECTED'`;
   if(tot.n>=50)break;
   const [r]=await sql`select * from europe_feasibility_extension_routes where sector=${sector} and status='CANDIDATE' order by route_hash limit 1`;
   if(!r)throw Error('Insufficient hash-order replacement candidates: '+sector);
   const ids=r.flight_ids||[];
   const fs=await sql`select fa_flight_id,actual_off,actual_on from europe_feasibility_flights where fa_flight_id=any(${ids}::text[])`;
   if(ids.length!==9||fs.length!==9||fs.some(x=>!x.actual_off||!x.actual_on||new Date(x.actual_on)<=new Date(x.actual_off))){
    await sql`update europe_feasibility_extension_routes set status='REJECTED',reject_reason='Frozen timestamp completeness',updated_at=now() where route_key=${r.route_key}`;
    rejections.push({route:r.route_key,reason:'timestamps'});continue;
   }
   let bad=null,transient=false;
   for(let i=0;i<9 && Date.now()<deadline-4000 && attempts<cap;i++){
    const id=ids[i];
    const existing=await sql`select 1 from europe_feasibility_tracks where fa_flight_id=${id}`;
    if(existing.length)continue;
    let response=null;
    for(let retry=0;retry<2;retry++){
      await reserve(sql); attempts++;
      try{response=await aero('/history/flights/'+encodeURIComponent(id)+'/track');break}
      catch(err){
       if([429,408,500,502,503,504].includes(Number(err.status))){
        transient=true;await delay(600+retry*800);if(retry===1)break;
       }else{bad=err.message;break}
      }
    }
    if(!response){if(!bad)transient=true;break}
    const points=clean(response);
    if(points.length<2){bad='missing usable timestamped track';break}
    await sql`insert into europe_feasibility_tracks(fa_flight_id,route_key,role,point_count,actual_distance,points) values(${id},${r.route_key},${i<6?'TRAIN':'EVAL'},${points.length},${response.actual_distance??null},${JSON.stringify(points)}::jsonb) on conflict(fa_flight_id) do nothing`;
    stored++;await delay(250);
   }
   if(bad){
    await sql`update europe_feasibility_extension_routes set status='REJECTED',reject_reason=${bad},updated_at=now() where route_key=${r.route_key}`;rejections.push({route:r.route_key,reason:bad});continue;
   }
   if(transient)break;
   const [n]=await sql`select count(*)::int n from europe_feasibility_tracks where route_key=${r.route_key} and fa_flight_id=any(${ids}::text[])`;
   if(n.n===9){
    await sql`update europe_feasibility_extension_routes set status='SELECTED',selection_rank=(select count(*)+1 from europe_feasibility_extension_routes where sector=${sector} and status='SELECTED'),updated_at=now() where route_key=${r.route_key}`;
   }else break;
  }
 }
 const selected=await sql`select sector,count(*)::int n from europe_feasibility_extension_routes where status='SELECTED' group by sector`;
 const c=Object.fromEntries(selected.map(x=>[x.sector,x.n]));
 let score=null;
 if(c.short===50 && c.medium===50){score=await scoreExtension(sql)}
 return {attempts,stored,rejections,selected:c,done:!!score,result_id:score?.id??null};
}
export async function extension(req,res,pilot=false){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'unauthorized'});
 const sql=db();
 const pilotRow='ops:extension_pilot',leaseKey=pilot?pilotRow:'ops:extension_run';
 await sql`insert into europe_feasibility_progress(task_key,status,detail) values('budget:extension_requests','IN_PROGRESS','{}'::jsonb) on conflict(task_key) do nothing`;
 await sql`insert into europe_feasibility_progress(task_key,status,detail) values(${leaseKey},'PENDING','{}'::jsonb) on conflict(task_key) do nothing`;
 if(pilot){
  const [claim]=await sql`update europe_feasibility_progress set status='RUNNING',updated_at=now() where task_key=${leaseKey} and status='PENDING' returning task_key`;
  if(!claim)return json(res,200,{ok:true,skipped:'pilot already attempted'});
 }else{
  const [ok]=await sql`select status from europe_feasibility_progress where task_key=${pilotRow}`;
  if(!ok||ok.status!=='DONE')return json(res,409,{ok:false,error:'pilot not completed'});
  const [claim]=await sql`update europe_feasibility_progress set status='RUNNING',updated_at=now() where task_key=${leaseKey} and (status='PENDING' or (status='RUNNING' and updated_at<now()-interval '3 minutes')) returning task_key`;
  if(!claim)return json(res,200,{ok:true,skipped:'extension execution already held'});
 }
 try{
  const before=pilot?await usage():null;
  const out=await work(sql,pilot?10:150,Date.now()+85000);
  const after=pilot?await usage():null;
  await sql`update europe_feasibility_progress set status=${pilot?'DONE':out.done?'DONE':'PENDING'},detail=detail||${JSON.stringify({last:out,pilot_usage_before:before,pilot_usage_after:after,at:new Date().toISOString()})}::jsonb,updated_at=now() where task_key=${leaseKey}`;
  return json(res,200,{ok:true,phase:pilot?'PILOT':'EXTENSION',...out});
 }catch(e){
  await sql`update europe_feasibility_progress set status='ERROR',detail=detail||${JSON.stringify({error:e.message,at:new Date().toISOString()})}::jsonb,updated_at=now() where task_key=${leaseKey}`;
  return json(res,500,{ok:false,error:e.message});
 }
}
