import{aero,addMin}from"./lib.js";
import{db,createJob,addCheckpoint}from"./db.js";

const AIRPORTS=["KATL","KDFW","KDEN","KORD","KLAX","KCLT","KLAS","KPHX","KMCO","KSEA","KIAH","KJFK","KEWR","KBOS","KMSP","KDTW","KSLC","KBWI","KPHL","KSFO"];
const START=new Date("2026-09-14T20:50:00Z");
const END=new Date("2026-09-14T23:45:00Z");
const BATCH_AFTER=new Date("2026-09-14T19:10:00Z");
const TARGET=300;
const STEP=50;
const code=x=>x?.code_icao||x?.code||x||"";

async function registerOne(f,now){
 const s=f.scheduled_out,sm=new Date(s).getTime();
 if(!Number.isFinite(sm)||sm-now<70*60000)throw new Error("lead<70");
 const j=await createJob(f);
 const t120=sm-120*60000,t60=sm-60*60000;
 let initState="PENDING",initDue=addMin(s,-90);
 if(now>=t60)initState="MISSING";else if(now>=t120)initDue=new Date().toISOString();
 await addCheckpoint(j.id,"INITIAL",initDue,1,initState,initDue);
 for(const [label,off] of [["T-60",-60],["T-30",-30],["T-15",-15],["T-10",-10]]){
   const nominal=addMin(s,off),state=now>=new Date(nominal).getTime()?"MISSING":"PENDING";
   await addCheckpoint(j.id,label,nominal,1,state,nominal);
 }
 await addCheckpoint(j.id,"DELAY",addMin(s,-5),1,"PENDING",addMin(s,-5));
 const postBase=f.scheduled_on||addMin(s,(f.filed_ete?f.filed_ete/60:180));
 await addCheckpoint(j.id,"POSTFLIGHT",addMin(postBase,15),1,"PENDING",addMin(postBase,15));
 return j.id;
}

export async function registerEveningBatchStep(){
 const sql=db();
 const already=(await sql`select count(*)::int n from flight_jobs where created_at>=${BATCH_AFTER.toISOString()}::timestamptz and scheduled_out_initial>=${START.toISOString()}::timestamptz and scheduled_out_initial<=${END.toISOString()}::timestamptz and origin like 'K%' and destination like 'K%'`)[0].n;
 if(already>=TARGET)return{done:true,already,registered_now:0,target:TARGET};
 const now=Date.now();
 const scanStart=new Date(Math.max(START.getTime(),now+70*60000));
 if(scanStart>=END)return{done:false,already,registered_now:0,target:TARGET,error:"window_closed"};
 let raw=[],airport_errors=[];
 for(const ap of AIRPORTS){
   try{const b=await aero(`/airports/${ap}/flights/scheduled_departures`,{start:scanStart.toISOString(),end:END.toISOString(),max_pages:4});raw.push(...(b.scheduled_departures||b.flights||[]));}
   catch(e){airport_errors.push({airport:ap,error:e.message,detail:e.body||null});}
 }
 const seen=new Map();
 for(const f of raw){
   const o=code(f.origin),d=code(f.destination),sm=new Date(f.scheduled_out).getTime();
   if(!f.fa_flight_id||!f.scheduled_out||!o.startsWith("K")||!d.startsWith("K")||sm<scanStart.getTime()||sm>END.getTime()||/cancel/i.test(String(f.status||"")))continue;
   if(!seen.has(f.fa_flight_id))seen.set(f.fa_flight_id,f);
 }
 const existing=await sql`select fa_flight_id from flight_jobs`;
 const have=new Set(existing.map(x=>x.fa_flight_id));
 const need=TARGET-already;
 const candidates=[...seen.values()].filter(f=>!have.has(f.fa_flight_id)).sort((a,b)=>new Date(a.scheduled_out)-new Date(b.scheduled_out));
 const selected=candidates.slice(0,Math.min(STEP,need));
 const done=[],failed=[];
 for(let i=0;i<selected.length;i+=10){
   const out=await Promise.all(selected.slice(i,i+10).map(async f=>{try{await registerOne(f,now);return{ok:true,f};}catch(e){return{ok:false,f,error:e.message}}}));
   for(const x of out)(x.ok?done:failed).push(x);
 }
 return{done:already+done.length>=TARGET,already,registered_now:done.length,batch_total:already+done.length,target:TARGET,new_candidates:candidates.length,failed:failed.length,airport_errors};
}
