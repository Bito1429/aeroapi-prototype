import { neon } from "@neondatabase/serverless";
import { assertTrialWindow,assertTrialKey,assertCleanDerived } from "./europe-option-b-core.js";
const MAX_FLIGHTS=150,MAX_REQUESTS=1000,BASE="https://aeroapi.flightaware.com/aeroapi";
const sql=()=>{if(!process.env.EUROPE_DATABASE_URL)throw Error("EUROPE_DB_MISSING");return neon(process.env.EUROPE_DATABASE_URL)};
const valid=s=>/^[A-Za-z0-9_-]{1,90}$/.test(s);
const iso=s=>s&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():null;
const xy=p=>({latitude:Number(p.latitude??p.lat),longitude:Number(p.longitude??p.lon)});
const points=p=>(Array.isArray(p)?p:[]).map(xy).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180);
function hav(a,b){const R=6371.0088,d=Math.PI/180,x=(b.latitude-a.latitude)*d,y=(b.longitude-a.longitude)*d,h=Math.sin(x/2)**2+Math.cos(a.latitude*d)*Math.cos(b.latitude*d)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function resample(p,n=32){if(p.length<2)throw Error("TRACK_TOO_SHORT");const lens=[0];for(let i=1;i<p.length;i++)lens.push(lens.at(-1)+hav(p[i-1],p[i]));const total=lens.at(-1);if(total<1)throw Error("TRACK_TOO_SHORT");return Array.from({length:n},(_,i)=>{const target=total*i/(n-1);let k=1;while(k<lens.length-1&&lens[k]<target)k++;const t=(target-lens[k-1])/(lens[k]-lens[k-1]||1);return {latitude:p[k-1].latitude+(p[k].latitude-p[k-1].latitude)*t,longitude:p[k-1].longitude+(p[k].longitude-p[k-1].longitude)*t}})}
function median(xs){const s=[...xs].sort((a,b)=>a-b);return(s[(s.length-1)>>1]+s[s.length>>1])/2}
function seed(tracks){const samples=tracks.map(t=>resample(points(t.points)));return Array.from({length:32},(_,i)=>({latitude:median(samples.map(t=>t[i].latitude)),longitude:median(samples.map(t=>t[i].longitude))}))}
function score(path,track){const a=resample(points(track),64),b=points(path);return median(a.map(p=>Math.min(...b.map(q=>hav(p,q)))))}
async function request(db,path){assertTrialWindow();const key=assertTrialKey();if(!/^\/flights\/[A-Za-z0-9_-]{1,90}(?:\/track)?(?:\?[A-Za-z0-9_=&%:.+-]+)?$/.test(path))throw Error("PATH_BLOCKED");
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
  detail=detail.replace(/[A-Za-z0-9_-]{25,}/g,"[redacted]").replace(/https?:\\/\\/\\S+/g,"[url]").replace(/[\\r\\n]/g," ").slice(0,160);
  throw Error("PROVIDER_HTTP_"+r.status+(detail?" "+detail:""));
 }
 const b=await r.json();if(/predicted_|foresight|cirium/i.test(JSON.stringify(b)))throw Error("FORBIDDEN_PROVIDER_FIELDS");return b;
}
const flightDate=f=>iso(f.scheduled_out||f.scheduled_off||f.estimated_out);
const landed=f=>Boolean(f.actual_on||f.actual_in);
export async function runEurope(phase){
 assertTrialWindow();assertTrialKey();if(!["probe","seed","predict","score"].includes(phase))throw Error("PHASE_NOT_ALLOWED");
 const db=sql();const [st]=await db`select halted from europe_option_b.trial_state where id=1`;if(st?.halted)throw Error("EUROPE_HALTED");
 if(phase==="probe"){
  let result="UNKNOWN",calls=0,status="FAILED";
  try{
   // One history track request using UK-linked flight metadata only; no pretrial track reuse.
   const history=await request(db,"/flights/WZZ1006?max_pages=1");calls=1;
   const flights=Array.isArray(history.flights)?history.flights:[];result=flights.length?"HISTORY_AVAILABLE":"HISTORY_EMPTY";status="OK";
  }catch(e){result=String(e.message).slice(0,200);if(/PROVIDER_HTTP_|EUROPE_USAGE_STOP|FORBIDDEN_PROVIDER_FIELDS/.test(result))calls=1}
  await db`insert into europe_option_b.run_audit(phase,request_count,predicted_count,scored_count,details) values('probe',${calls},0,0,${JSON.stringify({result,status})}::jsonb)`;
  return {phase,requests:calls,result,status};
 }
 const routes=await db`select route_key from europe_option_b.route_manifest order by uk_priority desc,route_key`;
 let calls=0,locked=0,scored=0,seeded=0,failures=0;
 const budget=phase==="seed"?Math.min(24,MAX_REQUESTS):Math.min(32,MAX_REQUESTS);
 if(phase==="score"){
  const pending=await db`select flight_id,route_key,locked_path from europe_option_b.trial_flights where locked_at is not null and scored_at is null order by departure_at asc limit 24`;
  for(const f of pending){if(calls+2>budget)break;try{
   const info=await request(db,"/flights/"+encodeURIComponent(f.flight_id));calls++;const flight=(info.flights||[])[0];if(!flight||!landed(flight))continue;
   const t=await request(db,"/flights/"+encodeURIComponent(f.flight_id)+"/track");calls++;
   const p=points(t.positions||t.track);if(p.length<2)continue;
   const receipt=new Date().toISOString(),error=score(f.locked_path,p);
   const [row]=await db`insert into europe_option_b.raw_receipts(flight_id,received_at,delete_by,payload) values(${f.flight_id},${receipt},${new Date(Date.parse(receipt)+29*86400000).toISOString()},${JSON.stringify({positions:p})}::jsonb) returning receipt_id`;
   await db`update europe_option_b.trial_flights set arrival_at=${iso(flight.actual_on||flight.actual_in)},scored_at=now(),score_km=${error},baseline_median_km=${error},track_receipt_id=${row.receipt_id},state='SCORED' where flight_id=${f.flight_id} and scored_at is null`;
   await db`insert into europe_option_b.seed_tracks(flight_id,route_key,received_at,points,expires_at) values(${f.flight_id},${f.route_key},${receipt},${JSON.stringify(p)}::jsonb,${new Date(Date.parse(receipt)+29*86400000).toISOString()}) on conflict(flight_id) do nothing`;
   scored++;
  }catch(e){if(/EUROPE_USAGE_STOP|EUROPE_HALTED|DAILY_REQUEST_CAP/.test(e.message))throw e;failures++}}
 }else{
  const [today]=await db`select count(*)::int n from europe_option_b.trial_flights where locked_at >= date_trunc('day',now() at time zone 'UTC')`;
  for(const r of routes){if(calls>=budget||phase==="predict"&&today.n+locked>=MAX_FLIGHTS)break;
   const [op,ident,origin,dest]=r.route_key.split("|");if(!valid(ident)||!origin||!dest)continue;
   try{
    const history=await request(db,"/flights/"+ident+"?max_pages=1");calls++;
    const flights=(history.flights||[]).filter(f=>(f.origin?.code_icao||f.origin?.code)===origin&&(f.destination?.code_icao||f.destination?.code)===dest&&valid(f.fa_flight_id));
    if(phase==="seed"){
     const past=flights.filter(landed).slice(0,2);
     for(const f of past){if(calls>=budget)break;const [exists]=await db`select 1 ok from europe_option_b.seed_tracks where flight_id=${f.fa_flight_id}`;if(exists)continue;
      const t=await request(db,"/flights/"+f.fa_flight_id+"/track");calls++;const p=points(t.positions||t.track);if(p.length<2)continue;
      const receipt=new Date().toISOString();
      await db`insert into europe_option_b.seed_tracks(flight_id,route_key,received_at,points,expires_at) values(${f.fa_flight_id},${r.route_key},${receipt},${JSON.stringify(p)}::jsonb,${new Date(Date.parse(receipt)+29*86400000).toISOString()}) on conflict do nothing`;seeded++;
     }
    }
    const stored=await db`select points from europe_option_b.seed_tracks where route_key=${r.route_key} and expires_at>now() order by received_at desc limit 6`;
    if(stored.length===6){const path=assertCleanDerived(seed(stored));const version="trial-six-v1-"+new Date().toISOString().slice(0,10);
     await db`insert into europe_option_b.route_seeds(route_key,seed_version,source,derived_path) values(${r.route_key},${version},'fresh_trial',${JSON.stringify(path)}::jsonb) on conflict(route_key) do update set seed_version=excluded.seed_version,derived_path=excluded.derived_path,created_at=now()`;
    }
    if(phase==="predict"){
     const [s]=await db`select seed_version,derived_path from europe_option_b.route_seeds where route_key=${r.route_key}`;if(!s)continue;
     for(const f of flights){if(today.n+locked>=MAX_FLIGHTS)break;const departure=flightDate(f);if(!departure||Date.parse(departure)<=Date.now()+15*60000||Date.parse(departure)>Date.now()+8*3600000||landed(f))continue;
      const inserted=await db`insert into europe_option_b.trial_flights(flight_id,route_key,departure_at,predicted_at,locked_at,seed_version,locked_path,state) values(${f.fa_flight_id},${r.route_key},${departure},now(),now(),${s.seed_version},${JSON.stringify(s.derived_path)}::jsonb,'LOCKED') on conflict(flight_id) do nothing returning flight_id`;locked+=inserted.length;
     }
    }
   }catch(e){if(/EUROPE_USAGE_STOP|EUROPE_HALTED|DAILY_REQUEST_CAP/.test(e.message))throw e;failures++}
  }
 }
 await db`insert into europe_option_b.run_audit(phase,request_count,predicted_count,scored_count,details) values(${phase},${calls},${locked},${scored},${JSON.stringify({seeded,failures})}::jsonb)`;
 return {phase,requests:calls,predicted:locked,scored,seeded,failures};
}
