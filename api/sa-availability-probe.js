import {neon} from '@neondatabase/serverless';
import {aero,json,havKm} from './lib.js';
const OPS=[['LATAM','LAN'],['GOL','GLO'],['Azul','AZU'],['JetSMART','JAT'],['SKY Airline','SKU'],['Avianca','AVA']];
const CODES=new Set(['SB','SC','SP','SK','SA','SL','SE','SG','SU','SV','SM','SO','SY','GF']);
const NMAX=5;
const country=x=>{x=String(x||'');return CODES.has(x.slice(0,2))?x.slice(0,2):null};
const airport=x=>x?.code_icao||x?.code||x||'';
const tm=x=>{const t=typeof x==='number'?(x>1e12?x:x*1000):Date.parse(x);return Number.isFinite(t)?t:null};
const pause=x=>new Promise(resolve=>setTimeout(resolve,x));
export default async function handler(req,res){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return json(res,401,{ok:false,error:'unauthorized'});
 const sql=neon(process.env.EUROPE_DATABASE_URL);
 await sql`create table if not exists sa_probe_20261023 (operator text primary key,summary jsonb not null,created_at timestamptz not null default now())`;
 await sql`insert into europe_feasibility_progress(task_key,status,detail) values('ops:sa_probe_20261023','PENDING','{}'::jsonb) on conflict(task_key) do nothing`;
 const [lease]=await sql`update europe_feasibility_progress set status='RUNNING',updated_at=now() where task_key='ops:sa_probe_20261023' and status='PENDING' returning task_key`;
 if(!lease)return json(res,200,{ok:true,skipped:'one-shot probe already started'});
 let pages=0,tracks=0,cost=0,rows=[];
 try{
  const before=await aero('/account/usage').catch(e=>({error:e.message}));
  for(const [name,op] of OPS){
   const matches=new Map(), listing=[],errors=[];
   for(const hour of [0,6,12,18]){
    if(cost+0.02>9.0)break;
    const start='2026-09-20T'+String(hour).padStart(2,'0')+':00:00Z';
    const end=hour===18?'2026-09-21T00:00:00Z':'2026-09-20T'+String(hour+6).padStart(2,'0')+':00:00Z';
    try{
     const b=await aero('/history/operators/'+op+'/flights',{start,end,max_pages:1});
     pages++;cost+=.02; listing.push({start,total:(b.flights||[]).length});
     for(const f of b.flights||[]){
      const o=airport(f.origin),d=airport(f.destination);
      if(!f.fa_flight_id||!country(o)||country(o)!==country(d)||o===d||matches.has(f.fa_flight_id))continue;
      matches.set(f.fa_flight_id,{id:f.fa_flight_id,ident:f.ident_icao||f.ident,origin:o,destination:d});
     }
    }catch(e){errors.push('listing '+hour+': '+e.message);pages++;cost+=.02;}
    await pause(230);
   }
   const samples=[];
   for(const f of matches.values()){
    if(samples.length>=NMAX||cost+.06>9.0)break;
    try{
     const b=await aero('/history/flights/'+encodeURIComponent(f.id)+'/track');
     tracks++;cost+=.06;
     const p=(b.positions||b.track||[]).map(x=>({lat:Number(x.latitude),lon:Number(x.longitude),t:tm(x.timestamp)})).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&x.t!==null).sort((a,b)=>a.t-b.t);
     let gap=0,segment=null;
     for(let i=1;i<p.length;i++){const g=(p[i].t-p[i-1].t)/60000;if(g>gap){gap=g;segment={start_lat:p[i-1].lat,start_lon:p[i-1].lon,end_lat:p[i].lat,end_lon:p[i].lon,km:+havKm({latitude:p[i-1].lat,longitude:p[i-1].lon},{latitude:p[i].lat,longitude:p[i].lon}).toFixed(1)}}}
     samples.push({...f,positions:p.length,largest_gap_min:+gap.toFixed(2),largest_gap_segment:segment,start:p[0]||null,end:p.at(-1)||null});
    }catch(e){tracks++;cost+=.06;errors.push('track '+f.id+': '+e.message);}
    await pause(230);
   }
   const row={name,op,available:listing.some(x=>x.total>0),listing,matches:matches.size,samples,errors};
   rows.push(row);
   await sql`insert into sa_probe_20261023(operator,summary) values(${op},${JSON.stringify(row)}::jsonb) on conflict(operator) do update set summary=excluded.summary`;
  }
  const after=await aero('/account/usage').catch(e=>({error:e.message}));
  await sql`update europe_feasibility_progress set status='DONE',detail=${JSON.stringify({pages,tracks,estimated_usd:cost,before_track_cost:before.resource_details?.find(x=>x.operation==='GET /history/flights/{id}/track')?.resource_cost,after_track_cost:after.resource_details?.find(x=>x.operation==='GET /history/flights/{id}/track')?.resource_cost,completed_at:new Date().toISOString()})}::jsonb,updated_at=now() where task_key='ops:sa_probe_20261023'`;
  return json(res,200,{ok:true,pages,tracks,estimated_usd:cost,rows});
 }catch(e){
  await sql`update europe_feasibility_progress set status='ERROR',detail=${JSON.stringify({error:e.message,pages,tracks,estimated_usd:cost})}::jsonb,updated_at=now() where task_key='ops:sa_probe_20261023'`;
  return json(res,500,{ok:false,error:e.message,pages,tracks,cost});
 }
}