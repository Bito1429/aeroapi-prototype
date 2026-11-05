import { neon } from "@neondatabase/serverless";
import { assertTrialWindow,assertTrialKey,assertCleanDerived } from "./europe-option-b-core.js";
const MAX_FLIGHTS=150,MAX_REQUESTS=300,BASE="https://aeroapi.flightaware.com/aeroapi";
const sql=()=>{if(!process.env.EUROPE_DATABASE_URL)throw Error("EUROPE_DB_MISSING");return neon(process.env.EUROPE_DATABASE_URL)};
const valid=s=>/^[A-Za-z0-9_-]{1,90}$/.test(s);
const iso=s=>s&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():null;
const xy=p=>({latitude:Number(p.latitude??p.lat),longitude:Number(p.longitude??p.lon)});
const points=p=>(Array.isArray(p)?p:[]).map(xy).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180);
function hav(a,b){const R=6371.0088,d=Math.PI/180,x=(b.latitude-a.latitude)*d,y=(b.longitude-a.longitude)*d,h=Math.sin(x/2)**2+Math.cos(a.latitude*d)*Math.cos(b.latitude*d)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function resample(p,n=32){if(p.length<2)throw Error("TRACK_TOO_SHORT");const lens=[0];for(let i=1;i<p.length;i++)lens.push(lens.at(-1)+hav(p[i-1],p[i]));const total=lens.at(-1);if(total<1)throw Error("TRACK_TOO_SHORT");return Array.from({length:n},(_,i)=>{const target=total*i/(n-1);let k=1;while(k<lens.length-1&&lens[k]<target)k++;const t=(target-lens[k-1])/(lens[k]-lens[k-1]||1);return {latitude:p[k-1].latitude+(p[k].latitude-p[k-1].latitude)*t,longitude:p[k-1].longitude+(p[k].longitude-p[k-1].longitude)*t}})}
function median(xs){const s=[...xs].sort((a,b)=>a-b);return(s[(s.length-1)>>1]+s[s.length>>1])/2}
function seed(tracks){const samples=tracks.map(t=>resample(points(t.points)));return Array.from({length:32},(_,i)=>({latitude:median(samples.map(t=>t[i].latitude)),longitude:median(samples.map(t=>t[i].longitude))}))}
const OPTION_B_ALPHA=0.3,PATH_POINTS=101;
function adaptivePath(oldPath,newTrack){
 const incoming=resample(points(newTrack),PATH_POINTS);
 if(!oldPath)return assertCleanDerived(incoming);
 const old=resample(points(oldPath),PATH_POINTS);
 return assertCleanDerived(old.map((p,i)=>({latitude:(1-OPTION_B_ALPHA)*p.latitude+OPTION_B_ALPHA*incoming[i].latitude,longitude:(1-OPTION_B_ALPHA)*p.longitude+OPTION_B_ALPHA*incoming[i].longitude})));
}
function score(path,track){const a=resample(points(track),64),b=points(path);return median(a.map(p=>Math.min(...b.map(q=>hav(p,q)))))}
async function request(db,path){assertTrialWindow();const key=assertTrialKey();
 const flightAllowed=/^\/flights\/[A-Za-z0-9_-]{1,90}(?:\/track)?$/.test(path);
 const airportAllowed=/^\/airports\/[A-Z]{4}\/flights\/departures\?max_pages=1$/.test(path);
 if(!flightAllowed&&!airportAllowed)throw Error("PATH_BLOCKED");
 const [st]=await db`select halted from europe_option_b.trial_state where id=1`;if(st?.halted)throw Error("EUROPE_HALTED");
 const [c]=await db`select count(*)::int n from europe_option_b.request_audit where day=(now() at time zone 'UTC')::date`;if(c.n>=MAX_REQUESTS)throw Error("DAILY_REQUEST_CAP");
 let r;try{r=await fetch(BASE+path,{headers:{"x-apikey":key},cache:"no-store",signal:AbortSignal.timeout(12000)})}catch{throw Error("PROVIDER_NETWORK_ERROR")}
 const warning=[r.headers.get("warning"),r.headers.get("x-usage-warning"),r.headers.get("x-ratelimit-remaining")].filter(Boolean).join(" ").slice(0,160);
 const halted=r.status===429||r.status===402||/quota|exceed|billing|credit|usage|rate.limit/i.test(warning)||/^(0|1)$/.test(warning.trim());
 await db`insert into europe_option_b.request_audit(day,status,warning,halted) values((now() at time zone 'UTC')::date,${r.status},${warning},${halted})`;
 if(halted){await db`update europe_option_b.trial_state set halted=true,reason='PROVIDER_USAGE_WARNING' where id=1`;throw Error("EUROPE_USAGE_STOP")}
 if(!r.ok){
  const raw=(await r.text()).slice(0,1200);let detail="";
  try{const j=JSON.parse(raw);detail=String(j.error?.message||j.error||j.message||j.detail||"")}catch{detail=""}
  // Error message only: never retain response objects, tracks, coordinates, or credentials.
  detail=detail.replace(/[A-Za-z0-9_-]{25,}/g,"[redacted]").replace(/https?:[^ ]+/g,"[url]").replace(/[\r\n]/g," ").slice(0,160);
  throw Error("PROVIDER_HTTP_"+r.status+(detail?" "+detail:""));
 }
 const b=await r.json();if(/predicted_|foresight|cirium/i.test(JSON.stringify(b)))throw Error("FORBIDDEN_PROVIDER_FIELDS");return b;
}
const flightDate=f=>iso(f.scheduled_out||f.scheduled_off||f.estimated_out);
const landed=f=>Boolean(f.actual_on||f.actual_in);
export async function runEurope(phase){
 assertTrialWindow();assertTrialKey();if(!["collect","predict","score"].includes(phase))throw Error("PHASE_NOT_ALLOWED");
 const db=sql();const [st]=await db`select halted from europe_option_b.trial_state where id=1`;if(st?.halted)throw Error("EUROPE_HALTED");

 const dbRoutes=await db`select route_key from europe_option_b.route_manifest where uk_priority=true order by case when split_part(route_key,'|',3) in ('EGKK','EGSS','EGCC','EGGW','EGGD','EGPH') then 0 else 1 end,route_key limit 50`;
 const routes=new Map(dbRoutes.map(r=>[r.route_key,r]));
 const airports=[...new Set(dbRoutes.map(r=>r.route_key.split("|")[2]))].filter(x=>/^[A-Z]{4}$/.test(x));
 let calls=0,discovered=0,collected=0,seeded=0,locked=0,scored=0,failures=0;
 const budget=8,errors=[];
 const safeError=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,"[url]").replace(/[A-Za-z0-9_-]{32,}/g,"[redacted]").replace(/[\r\n]/g," ").slice(0,160);
 const invoke=async path=>{if(calls>=budget)throw Error("RUN_REQUEST_CAP");calls++;try{return await request(db,path)}catch(e){
  const message=safeError(e);errors.push({message,status:Number((message.match(/PROVIDER_HTTP_(\\d+)/)||[])[1])||0});
  if(!message.startsWith("PROVIDER_HTTP_"))await db`insert into europe_option_b.request_audit(day,status,warning,halted) values((now() at time zone 'UTC')::date,0,${message},false)`;
  else await db`update europe_option_b.request_audit set warning=left(concat_ws(' ',nullif(warning,''),${message}),160) where id=(select max(id) from europe_option_b.request_audit)`;
  throw e;
 }};
 const keyFor=f=>{const ident=String(f.ident_icao||f.ident||"");const o=String(f.origin?.code_icao||f.origin?.code||"");const d=String(f.destination?.code_icao||f.destination?.code||"");return [...routes.keys()].find(k=>{const a=k.split("|");return a[1]===ident&&a[2]===o&&a[3]===d})};
 if(phase==="collect"){
  // Only live/current airport departures; no history, no lookback parameters.
  const airport=airports[Math.floor(Date.now()/900000)%Math.max(airports.length,1)];
  if(airport){
   try{
    const data=await invoke("/airports/"+airport+"/flights/departures?max_pages=1");
    for(const f of (data.departures||[])){
     const route=keyFor(f),id=String(f.fa_flight_id||"");
     const departure=flightDate(f);
     if(!route||!valid(id)||!departure||Date.parse(departure)<Date.now()-3*3600000||Date.parse(departure)>Date.now()+12*3600000)continue;
     const ins=await db`insert into europe_option_b.trial_flights(flight_id,route_key,departure_at,state) values(${id},${route},${departure},'ENROLLED') on conflict(flight_id) do nothing returning flight_id`;
     discovered+=ins.length;
    }
   }catch(e){if(/EUROPE_USAGE_STOP|EUROPE_HALTED|DAILY_REQUEST_CAP/.test(e.message))throw e;failures++}
  }
  // A flight must have been enrolled during the live trial before a post-landing track is requested.
  const pending=await db`select flight_id,route_key,departure_at from europe_option_b.trial_flights where state='ENROLLED' and departure_at<now()-interval '50 minutes' and departure_at>now()-interval '12 hours' order by departure_at limit 5`;
  for(const f of pending){
   if(calls+2>budget)break;
   try{
    const info=await invoke("/flights/"+f.flight_id);
    const live=(info.flights||[]).find(x=>x.fa_flight_id===f.flight_id);
    if(!live||!landed(live))continue;
    const actual=iso(live.actual_on||live.actual_in);
    if(!actual||Date.now()-Date.parse(actual)>3*3600000)continue;
    const t=await invoke("/flights/"+f.flight_id+"/track");
    const p=points(t.positions||t.track);
    if(p.length<2)continue;
    const received=new Date().toISOString(),expires=new Date(Date.now()+29*86400000).toISOString();
    const ins=await db`insert into europe_option_b.seed_tracks(flight_id,route_key,received_at,points,expires_at) values(${f.flight_id},${f.route_key},${received},${JSON.stringify(p)}::jsonb,${expires}) on conflict(flight_id) do nothing returning flight_id`;
    collected+=ins.length;
    await db`update europe_option_b.trial_flights set state='CAPTURED',arrival_at=${actual} where flight_id=${f.flight_id} and state='ENROLLED'`;
    const [previous]=await db`select derived_path from europe_option_b.route_seeds where route_key=${f.route_key}`;
    const derived=adaptivePath(previous?.derived_path||null,p);
    const version="adaptive-a030-"+Date.now();
    const updated=await db`insert into europe_option_b.route_seeds(route_key,seed_version,source,derived_path) values(${f.route_key},${version},'live_incremental_a030',${JSON.stringify(derived)}::jsonb) on conflict(route_key) do update set seed_version=excluded.seed_version,source=excluded.source,derived_path=excluded.derived_path,created_at=now() returning route_key`;
    seeded+=updated.length;
   }catch(e){if(/EUROPE_USAGE_STOP|EUROPE_HALTED|DAILY_REQUEST_CAP/.test(e.message))throw e;failures++}
  }
 }else if(phase==="predict"){
  const candidates=await db`select t.flight_id,t.route_key,t.departure_at,s.seed_version,s.derived_path from europe_option_b.trial_flights t join europe_option_b.route_seeds s on s.route_key=t.route_key where t.state='ENROLLED' and t.locked_at is null and t.departure_at>now()+interval '15 minutes' and t.departure_at<now()+interval '8 hours' order by t.departure_at limit 150`;
  for(const f of candidates){
   const [count]=await db`select count(*)::int n from europe_option_b.trial_flights where locked_at >= date_trunc('day',now() at time zone 'UTC')`;
   if(count.n>=MAX_FLIGHTS)break;
   const ins=await db`update europe_option_b.trial_flights set predicted_at=now(),locked_at=now(),seed_version=${f.seed_version},locked_path=${JSON.stringify(f.derived_path)}::jsonb,state='LOCKED' where flight_id=${f.flight_id} and locked_at is null and departure_at>now()+interval '15 minutes' returning flight_id`;
   locked+=ins.length;
   if(ins.length){
    const tracks=await db`select flight_id,points from europe_option_b.seed_tracks where route_key=${f.route_key} and expires_at>now() order by received_at desc limit 6`;
    if(tracks.length){
     const methods=[["most_recent",assertCleanDerived(resample(points(tracks[0].points)))],["option_b_adaptive",assertCleanDerived(points(f.derived_path))]];
     if(tracks.length===6)methods.push(["rolling_six",assertCleanDerived(seed(tracks))]);
     for(const [method,path] of methods)await db`insert into europe_option_b.method_comparisons(flight_id,method,seed_version,locked_path) values(${f.flight_id},${method},${f.seed_version},${JSON.stringify(path)}::jsonb) on conflict(flight_id,method) do nothing`;
    }
   }
  }
 }else if(phase==="score"){
  const pending=await db`select flight_id,route_key,locked_path from europe_option_b.trial_flights where state='LOCKED' and locked_at is not null and scored_at is null and departure_at<now()-interval '50 minutes' order by departure_at limit 4`;
  for(const f of pending){
   if(calls+2>budget)break;
   try{
    const info=await invoke("/flights/"+f.flight_id);
    const live=(info.flights||[]).find(x=>x.fa_flight_id===f.flight_id);
    if(!live||!landed(live))continue;
    const actual=iso(live.actual_on||live.actual_in);
    if(!actual||Date.now()-Date.parse(actual)>3*3600000)continue;
    const track=await invoke("/flights/"+f.flight_id+"/track"),p=points(track.positions||track.track);
    if(p.length<2)continue;
    const received=new Date().toISOString();
    const [receipt]=await db`insert into europe_option_b.raw_receipts(flight_id,received_at,delete_by,payload) values(${f.flight_id},${received},${new Date(Date.now()+29*86400000).toISOString()},${JSON.stringify({positions:p})}::jsonb) returning receipt_id`;
    const err=score(f.locked_path,p);
    const ins=await db`update europe_option_b.trial_flights set arrival_at=${actual},scored_at=now(),score_km=${err},track_receipt_id=${receipt.receipt_id},state='SCORED' where flight_id=${f.flight_id} and scored_at is null returning flight_id`;
    scored+=ins.length;
    if(ins.length){
     const [previous]=await db`select derived_path from europe_option_b.route_seeds where route_key=${f.route_key}`;
     const updatedPath=adaptivePath(previous?.derived_path||null,p);
     await db`insert into europe_option_b.route_seeds(route_key,seed_version,source,derived_path) values(${f.route_key},${"adaptive-a030-"+Date.now()},'live_incremental_a030',${JSON.stringify(updatedPath)}::jsonb) on conflict(route_key) do update set seed_version=excluded.seed_version,source=excluded.source,derived_path=excluded.derived_path,created_at=now()`;

     const comparisons=await db`select method,locked_path from europe_option_b.method_comparisons where flight_id=${f.flight_id} and scored_at is null`;
     for(const m of comparisons){
      const error=score(m.locked_path,p);
      await db`update europe_option_b.method_comparisons set scored_at=now(),error_km=${error} where flight_id=${f.flight_id} and method=${m.method} and scored_at is null`;
     }
    }
   }catch(e){if(/EUROPE_USAGE_STOP|EUROPE_HALTED|DAILY_REQUEST_CAP/.test(e.message))throw e;failures++}
  }
 }
 await db`insert into europe_option_b.run_audit(phase,request_count,predicted_count,scored_count,details) values(${phase},${calls},${locked},${scored},${JSON.stringify({discovered,collected,seeded,failures,errors:errors.slice(0,8)})}::jsonb)`;
 return {phase,requests:calls,discovered,collected,seeded,predicted:locked,scored,failures};
}
