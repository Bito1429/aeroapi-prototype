import crypto from "node:crypto";
import{aero,json,havKm,polyKm}from"./lib.js";
import{db}from"./db.js";

const OPS=["RYR","EZY","EXS","WZZ"];
const START_DAY=new Date("2026-08-15T00:00:00Z");
const END_DAY=new Date("2026-09-29T00:00:00Z");
const CUTOFF_MS=new Date("2026-09-28T23:59:59Z").getTime();
const ALLOWED=new Set(["LO","EB","LB","LD","LC","LK","EK","EE","EF","LF","ED","LG","LH","EI","LI","EV","EY","EL","LM","EH","EP","LP","LR","LZ","LJ","LE","GC","ES","EG","EN","LS","BI"]);
const ROUTE_PCTS=[20,40,60,80,95],ETA_PCTS=[20,40,60,80],N=101;
const PAGE_DELAY_MS=230;
const RUN_MS=235000;

const code=x=>x?.code_icao||x?.code||x||"";
const ms=x=>{const n=typeof x==="number"?x:new Date(x).getTime();return Number.isFinite(n)?n:null};
const pms=x=>{if(typeof x==="number")return x>1e12?x:x*1000;const n=new Date(x).getTime();return Number.isFinite(n)?n:null};
const sleep=x=>new Promise(r=>setTimeout(r,x));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function pctile(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.min(s.length-1,Math.ceil(p*s.length)-1))]}
function r3(x){return x==null?null:+x.toFixed(3)}
function inside(x){return x&&ALLOWED.has(String(x).slice(0,2).toUpperCase())}
function keyOf(op,f){return[op,String(f.ident_icao||f.ident||""),code(f.origin),code(f.destination)].join("|")}
function hash(k){return crypto.createHash("sha256").update(k).digest("hex")}
function validFlight(op,f){
 const o=code(f.origin),d=code(f.destination),oper=String(f.operator_icao||f.operator||"").toUpperCase(),ident=String(f.ident_icao||f.ident||"").toUpperCase();
 return !!f.fa_flight_id&&!!f.scheduled_out&&!!f.scheduled_in&&inside(o)&&inside(d)&&o!==d&&oper===op&&ident.startsWith(op)&&ms(f.actual_on||f.actual_in)!=null&&ms(f.actual_on||f.actual_in)<=CUTOFF_MS&&/arriv/i.test(String(f.status||""));
}
async function seed(sql){
 const rows=[];
 for(let d=new Date(START_DAY);d<END_DAY;d=new Date(d.getTime()+86400000)){
  const day=d.toISOString().slice(0,10);
  for(const op of OPS)rows.push({task_key:`enum:${day}:${op}`,day,op});
 }
 for(const x of rows)await sql`insert into europe_feasibility_progress(task_key,status,detail) values(${x.task_key},'PENDING',${JSON.stringify({day:x.day,op:x.op})}::jsonb) on conflict(task_key) do nothing`;
}
async function enumStatus(sql){
 const r=await sql`select status,count(*)::int n from europe_feasibility_progress where task_key like 'enum:%' group by status`;
 return Object.fromEntries(r.map(x=>[x.status,x.n]));
}
async function enumerate(sql,deadline){
 await seed(sql);
 while(Date.now()<deadline){
  const [task]=await sql`select * from europe_feasibility_progress where task_key like 'enum:%' and status<>'DONE' order by task_key limit 1`;
  if(!task)break;
  const day=task.detail.day,op=task.detail.op,start=day+"T00:00:00Z",end=new Date(new Date(start).getTime()+86400000).toISOString();
  let path=task.cursor||"/history/operators/"+op+"/flights",params=task.cursor?{}:{start,end,max_pages:1};
  try{
   const b=await aero(path,params),flights=b.flights||[];
   for(const f of flights){
    if(!validFlight(op,f))continue;
    await sql`insert into europe_feasibility_flights(fa_flight_id,operator_icao,ident,origin,destination,scheduled_out,scheduled_in,actual_off,actual_on,status,source_day,raw)
      values(${f.fa_flight_id},${op},${String(f.ident_icao||f.ident||"")},${code(f.origin)},${code(f.destination)},${f.scheduled_out}::timestamptz,${f.scheduled_in}::timestamptz,${f.actual_off||null}::timestamptz,${f.actual_on||null}::timestamptz,${f.status||null},${day}::date,${JSON.stringify(f)}::jsonb)
      on conflict(fa_flight_id) do nothing`;
   }
   const next=b.links?.next||null,status=next?"IN_PROGRESS":"DONE";
   await sql`update europe_feasibility_progress set status=${status},cursor=${next},page_count=page_count+1,flight_count=flight_count+${flights.length},updated_at=now() where task_key=${task.task_key}`;
   await sleep(PAGE_DELAY_MS);
  }catch(e){
   if(Number(e.status)===429){await sleep(2000);continue}
   await sql`update europe_feasibility_progress set status='ERROR',detail=detail||${JSON.stringify({error:e.message,body:e.body||null})}::jsonb,updated_at=now() where task_key=${task.task_key}`;
   throw e;
  }
 }
 return enumStatus(sql);
}
async function buildCandidates(sql){
 const n=await sql`select count(*)::int n from europe_feasibility_routes`;
 if(n[0].n)return;
 const rows=await sql`select operator_icao,ident,origin,destination,count(*)::int n,
   jsonb_agg(fa_flight_id order by scheduled_out desc) as ids,
   percentile_cont(0.5) within group(order by extract(epoch from(scheduled_in-scheduled_out))/60.0) as med_block
   from europe_feasibility_flights group by 1,2,3,4 having count(*)>=9`;
 for(const x of rows){
  const block=Number(x.med_block),sector=block<120?"short":block<=240?"medium":null;if(!sector)continue;
  const k=[x.operator_icao,x.ident,x.origin,x.destination].join("|"),ids=(x.ids||[]).slice(0,9).reverse();
  await sql`insert into europe_feasibility_routes(route_key,route_hash,sector,median_scheduled_block_min,qualifying_occurrence_count,flight_ids)
    values(${k},${hash(k)},${sector},${block},${x.n},${JSON.stringify(ids)}::jsonb) on conflict(route_key) do nothing`;
 }
}
function cleanTrack(b){const p=[];for(const x of(b.positions||b.track||[])){const latitude=Number(x.latitude),longitude=Number(x.longitude),t=pms(x.timestamp);if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&t!=null)p.push({latitude,longitude,t})}p.sort((a,b)=>a.t-b.t);return p}
async function fillTracks(sql,deadline){
 await buildCandidates(sql);
 for(const sector of["short","medium"]){
  while(Date.now()<deadline){
   const done=await sql`select count(*)::int n from europe_feasibility_routes where sector=${sector} and selected=true`;
   if(done[0].n>=15)break;
   const [r]=await sql`select * from europe_feasibility_routes where sector=${sector} and selected=false and status='CANDIDATE' order by route_hash limit 1`;
   if(!r)throw new Error("insufficient candidate routes for "+sector);
   const ids=r.flight_ids||[];
   const fr=await sql`select fa_flight_id,actual_off,actual_on from europe_feasibility_flights where fa_flight_id=any(${ids}::text[])`;
   if(fr.length!==9||fr.some(x=>!x.actual_off||!x.actual_on||ms(x.actual_on)<=ms(x.actual_off))){
    await sql`update europe_feasibility_routes set status='REJECTED',reject_reason='missing actual_off/actual_on',updated_at=now() where route_key=${r.route_key}`;continue;
   }
   let bad=null;
   for(let i=0;i<ids.length;i++){
    const id=ids[i];
    const exists=await sql`select 1 from europe_feasibility_tracks where fa_flight_id=${id}`;
    if(exists.length)continue;
    try{
     const b=await aero("/history/flights/"+encodeURIComponent(id)+"/track"),pts=cleanTrack(b);
     if(pts.length<2){bad="missing_or_short_track";break}
     await sql`insert into europe_feasibility_tracks(fa_flight_id,route_key,role,point_count,actual_distance,points)
       values(${id},${r.route_key},${i<6?"TRAIN":"EVAL"},${pts.length},${b.actual_distance??null},${JSON.stringify(pts)}::jsonb) on conflict(fa_flight_id) do nothing`;
     await sleep(PAGE_DELAY_MS);
    }catch(e){if(Number(e.status)===429){await sleep(2000);i--;continue}bad=e.message;break}
    if(Date.now()>=deadline)break;
   }
   if(Date.now()>=deadline)break;
   if(bad){await sql`update europe_feasibility_routes set status='REJECTED',reject_reason=${bad},updated_at=now() where route_key=${r.route_key}`;continue}
   const tc=await sql`select count(*)::int n from europe_feasibility_tracks where route_key=${r.route_key}`;
   if(tc[0].n===9)await sql`update europe_feasibility_routes set selected=true,status='SELECTED',selection_rank=(select count(*)+1 from europe_feasibility_routes where sector=${sector} and selected=true),updated_at=now() where route_key=${r.route_key}`;
  }
 }
 const s=await sql`select sector,count(*)::int n from europe_feasibility_routes where selected=true group by sector`;
 return Object.fromEntries(s.map(x=>[x.sector,x.n]));
}
function atFrac(p,f){if(!p.length)return null;const total=polyKm(p),target=total*f;let d=0;for(let i=1;i<p.length;i++){const leg=havKm(p[i-1],p[i]);if(d+leg>=target){const q=leg?((target-d)/leg):0;return{latitude:p[i-1].latitude+(p[i].latitude-p[i-1].latitude)*q,longitude:p[i-1].longitude+(p[i].longitude-p[i-1].longitude)*q,t:p[i-1].t+(p[i].t-p[i-1].t)*q}}d+=leg}return p.at(-1)}
function resample(p){return Array.from({length:N},(_,i)=>atFrac(p,i/(N-1)))}
function medPt(a){return{latitude:median(a.map(x=>x.latitude)),longitude:median(a.map(x=>x.longitude))}}
function medPath(tr){const r=tr.map(resample);return Array.from({length:N},(_,i)=>medPt(r.map(x=>x[i])))}
function vec(p){const la=p.latitude*Math.PI/180,lo=p.longitude*Math.PI/180,c=Math.cos(la);return[c*Math.cos(lo),c*Math.sin(lo),Math.sin(la)]}
function unvec(v){const n=Math.hypot(...v),x=v[0]/n,y=v[1]/n,z=v[2]/n;return{latitude:Math.atan2(z,Math.hypot(x,y))*180/Math.PI,longitude:Math.atan2(y,x)*180/Math.PI}}
function gc(a,b){const A=vec(a),B=vec(b),dot=Math.max(-1,Math.min(1,A[0]*B[0]+A[1]*B[1]+A[2]*B[2])),om=Math.acos(dot);if(om<1e-9)return Array.from({length:N},()=>({...a}));return Array.from({length:N},(_,i)=>{const f=i/(N-1),s=Math.sin(om),u=Math.sin((1-f)*om)/s,v=Math.sin(f*om)/s;return unvec([u*A[0]+v*B[0],u*A[1]+v*B[1],u*A[2]+v*B[2]])})}
function minLine(p,line){const lat0=p.latitude*Math.PI/180,kLa=111.195,kLo=111.195*Math.cos(lat0);let best=Infinity;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],ax=(a.longitude-p.longitude)*kLo,ay=(a.latitude-p.latitude)*kLa,bx=(b.longitude-p.longitude)*kLo,by=(b.latitude-p.latitude)*kLa,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;let t=den?-(ax*dx+ay*dy)/den:0;t=Math.max(0,Math.min(1,t));best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy))}return best}
function fm(pred,act){return mean(ROUTE_PCTS.map(x=>minLine(atFrac(act,x/100),pred)))}
function summary(v){return{n:v.length,median:r3(median(v)),mean:r3(mean(v)),p90:r3(pctile(v,.9)),within_15_pct:r3(100*v.filter(x=>x<=15).length/v.length),within_50_pct:r3(100*v.filter(x=>x<=50).length/v.length)}}
function esum(v){const a=v.map(Math.abs);return{n:v.length,median_abs_min:r3(median(a)),mean_abs_min:r3(mean(a)),p90_abs_min:r3(pctile(a,.9)),mean_signed_min:r3(mean(v)),within_5_pct:r3(100*a.filter(x=>x<=5).length/v.length),within_10_pct:r3(100*a.filter(x=>x<=10).length/v.length),within_15_pct:r3(100*a.filter(x=>x<=15).length/v.length)}}
async function score(sql){
 const existing=await sql`select id,route_summary,eta_summary,metadata from europe_feasibility_results order by id desc limit 1`;if(existing.length)return existing[0];
 const routes=await sql`select * from europe_feasibility_routes where selected=true order by sector,selection_rank`;
 const evals=[];
 for(const r of routes){
  const ids=r.flight_ids||[];
  const fs=await sql`select f.fa_flight_id,f.actual_off,f.actual_on,t.points from europe_feasibility_flights f join europe_feasibility_tracks t using(fa_flight_id) where f.fa_flight_id=any(${ids}::text[])`;
  const m=new Map(fs.map(x=>[x.fa_flight_id,x])),ordered=ids.map(id=>m.get(id)),tr=ordered.slice(0,6),ev=ordered.slice(6);
  const mp=medPath(tr.map(x=>x.points)),recent=tr[5].points,great=gc(medPt(tr.map(x=>x.points[0])),medPt(tr.map(x=>x.points.at(-1))));
  const dur=median(tr.map(x=>(ms(x.actual_on)-ms(x.actual_off))/60000)),rem={};
  for(const p of ETA_PCTS)rem[p]=median(tr.map(x=>(ms(x.actual_on)-atFrac(x.points,p/100).t)/60000));
  for(const x of ev){const on=ms(x.actual_on),off=ms(x.actual_off),eta={takeoff:(off+dur*60000-on)/60000};for(const p of ETA_PCTS){const cp=atFrac(x.points,p/100);eta[p]=(cp.t+rem[p]*60000-on)/60000}evals.push({route_key:r.route_key,sector:r.sector,fa_flight_id:x.fa_flight_id,route_mean_xtd_km:{median_path:r3(fm(mp,x.points)),most_recent:r3(fm(recent,x.points)),great_circle:r3(fm(great,x.points))},eta_signed_error_min:Object.fromEntries(Object.entries(eta).map(([k,v])=>[k,r3(v)]))})}
 }
 const routeSummary={median_path:summary(evals.map(x=>x.route_mean_xtd_km.median_path)),most_recent_track:summary(evals.map(x=>x.route_mean_xtd_km.most_recent)),great_circle:summary(evals.map(x=>x.route_mean_xtd_km.great_circle))},eta={};
 for(const k of["takeoff","20","40","60","80"])eta[k]=esum(evals.map(x=>x.eta_signed_error_min[k]));
 const usable=routeSummary.median_path.median<=15&&routeSummary.median_path.within_50_pct>=70,noGc=routeSummary.median_path.median>=routeSummary.great_circle.median,conclusion=noGc||routeSummary.median_path.median>30?"not_usable":usable?"usable":"marginal";
 const meta={evaluated_flights:evals.length,route_predeclared_conclusion:conclusion,protocol_commit:"30796efb80815c74d31a69ea235214cc58a9add9"};
 const r=await sql`insert into europe_feasibility_results(protocol_commit,route_summary,eta_summary,evaluations,metadata) values('30796efb80815c74d31a69ea235214cc58a9add9',${JSON.stringify(routeSummary)}::jsonb,${JSON.stringify(eta)}::jsonb,${JSON.stringify(evals)}::jsonb,${JSON.stringify(meta)}::jsonb) returning id,route_summary,eta_summary,metadata`;
 return r[0];
}

export default async function handler(req,res){
 const sql=db(),deadline=Date.now()+RUN_MS;
 try{
  const est=await enumStatus(sql);const total=Object.values(est).reduce((a,b)=>a+b,0);
  if(total===0||((est.DONE||0)<180)){
   const status=await enumerate(sql,deadline);
   return json(res,200,{ok:true,phase:"ENUMERATE",status,continue:(status.DONE||0)<180});
  }
  const sel=await fillTracks(sql,deadline);
  if((sel.short||0)<15||(sel.medium||0)<15)return json(res,200,{ok:true,phase:"TRACKS",selected:sel,continue:true});
  const result=await score(sql);
  json(res,200,{ok:true,phase:"DONE",continue:false,result});
 }catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null});}
}
