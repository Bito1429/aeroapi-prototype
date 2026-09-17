import{aero,addMin,json}from"./lib.js";
import{db,createJob,addCheckpoint}from"./db.js";

const AIRPORTS=["KATL","KDFW","KDEN","KORD","KLAX","KCLT","KLAS","KPHX","KMCO","KSEA","KIAH","KJFK","KEWR","KBOS","KMSP","KDTW","KSLC","KBWI","KPHL","KSFO"];
const CARRIERS=new Set(["AAL","DAL","UAL","SWA","ASA","JBU","FFT","NKS","HAL","AAY","SCX","SKW","RPA","EDV","JIA","ENY","PDT","GJS","ASH","MXY","VXP"]);
const START=new Date("2026-09-17T15:00:00Z");
const END=new Date("2026-09-18T00:00:00Z");
const BATCH_AFTER=new Date("2026-09-17T13:15:00Z");
const TARGET=400;
const STEP=40;
const MIN_LEAD_MIN=90;
const BIN_MIN=15;
const code=x=>x?.code_icao||x?.code||x||"";
const carrierOf=f=>String(f.ident||f.ident_icao||"").match(/^([A-Z]{3})/)?.[1]||"";
const binOf=iso=>Math.floor((new Date(iso).getTime()-START.getTime())/(BIN_MIN*60000));

async function registerOne(f,now){
 const s=f.scheduled_out,sm=new Date(s).getTime();
 if(!Number.isFinite(sm)||sm-now<MIN_LEAD_MIN*60000)throw new Error("lead<90");
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

function balancedSelect(candidates,existingRows,n){
 const bins=Array.from({length:Math.ceil((END-START)/(BIN_MIN*60000))},()=>[]);
 for(const f of candidates){const b=binOf(f.scheduled_out);if(b>=0&&b<bins.length)bins[b].push(f);}
 const counts=Array(bins.length).fill(0);
 for(const r of existingRows){const b=binOf(r.scheduled_out_initial);if(b>=0&&b<counts.length)counts[b]++;}
 const selected=[];
 while(selected.length<n){
   let best=-1,bestCount=Infinity;
   for(let i=0;i<bins.length;i++)if(bins[i].length&&counts[i]<bestCount){best=i;bestCount=counts[i];}
   if(best<0)break;
   selected.push(bins[best].shift());counts[best]++;
 }
 return{selected,counts};
}

export default async function handler(req,res){try{
 const sql=db();
 const cohort=await sql`select fa_flight_id,scheduled_out_initial,ident from flight_jobs where created_at>=${BATCH_AFTER.toISOString()}::timestamptz and scheduled_out_initial>=${START.toISOString()}::timestamptz and scheduled_out_initial<${END.toISOString()}::timestamptz and origin like 'K%' and destination like 'K%'`;
 if(cohort.length>=TARGET)return json(res,200,{ok:true,done:true,batch_total:cohort.length,target:TARGET,window:[START,END],min_lead_minutes:MIN_LEAD_MIN,selection:"US domestic mainstream scheduled carriers; 15-minute balanced accrual; Cape Air/KAP excluded prospectively",bin_counts:Object.entries(cohort.reduce((a,r)=>(a[binOf(r.scheduled_out_initial)]=(a[binOf(r.scheduled_out_initial)]||0)+1,a),{}))});
 const now=Date.now();
 const scanStartMs=Math.max(START.getTime(),Math.ceil((now+MIN_LEAD_MIN*60000)/60000)*60000);
 const scanStart=new Date(scanStartMs);
 if(scanStart>=END)return json(res,409,{ok:false,done:false,batch_total:cohort.length,target:TARGET,error:"90-minute window closed",scan_start:scanStart});
 let raw=[],airport_errors=[];
 for(const ap of AIRPORTS){
   try{const b=await aero(`/airports/${ap}/flights/scheduled_departures`,{start:scanStart.toISOString(),end:END.toISOString(),max_pages:4});raw.push(...(b.scheduled_departures||b.flights||[]));}
   catch(e){airport_errors.push({airport:ap,error:e.message,detail:e.body||null});}
 }
 const seen=new Map();
 for(const f of raw){
   const o=code(f.origin),d=code(f.destination),sm=new Date(f.scheduled_out).getTime(),carrier=carrierOf(f);
   if(!f.fa_flight_id||!f.scheduled_out||!o.startsWith("K")||!d.startsWith("K")||sm<scanStart.getTime()||sm>=END.getTime()||/cancel/i.test(String(f.status||""))||!CARRIERS.has(carrier)||carrier==="KAP")continue;
   if(!seen.has(f.fa_flight_id))seen.set(f.fa_flight_id,f);
 }
 const existing=await sql`select fa_flight_id from flight_jobs`;
 const have=new Set(existing.map(x=>x.fa_flight_id));
 const candidates=[...seen.values()].filter(f=>!have.has(f.fa_flight_id)).sort((a,b)=>new Date(a.scheduled_out)-new Date(b.scheduled_out));
 const need=Math.min(STEP,TARGET-cohort.length);
 const{selected}=balancedSelect(candidates,cohort,need);
 const done=[],failed=[];
 for(let i=0;i<selected.length;i+=10){const out=await Promise.all(selected.slice(i,i+10).map(async f=>{try{await registerOne(f,now);return{ok:true,f};}catch(e){return{ok:false,f,error:e.message}}}));for(const x of out)(x.ok?done:failed).push(x);}
 const after=await sql`select scheduled_out_initial,ident from flight_jobs where created_at>=${BATCH_AFTER.toISOString()}::timestamptz and scheduled_out_initial>=${START.toISOString()}::timestamptz and scheduled_out_initial<${END.toISOString()}::timestamptz and origin like 'K%' and destination like 'K%' order by scheduled_out_initial`;
 const bins={};for(const r of after){const b=binOf(r.scheduled_out_initial);bins[b]=(bins[b]||0)+1;}
 return json(res,200,{ok:true,done:after.length>=TARGET,registered_now:done.length,batch_total:after.length,target:TARGET,new_candidates:candidates.length,failed:failed.length,airport_errors,window:[START,END],min_lead_minutes:MIN_LEAD_MIN,selection:"US domestic mainstream scheduled carriers; 15-minute balanced accrual; Cape Air/KAP excluded prospectively",bin_counts:bins});
}catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null})}}
