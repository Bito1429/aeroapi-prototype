import{db}from'./db.js';import{json,polyKm}from'./lib.js';import{methodA}from'./score.js';
const FIDS=['AAL1945-1789188520-airline-546p','AAL423-1788756466-airline-2353p','AAL864-1789196828-airline-1166p','DAL1320-1788840380-fa-421p','DAL1320-1789013171-fa-156p','DAL1692-1788753973-fa-1570p','DAL1692-1789013163-fa-476p','SWA2430-1788932455-airline-734p'];
const REP={
 'AAL423-1788756466-airline-2353p':17.7087,
 'DAL1692-1788753973-fa-1570p':30.9737,
 'DAL1320-1788840380-fa-421p':19.7337
};
const P={
 RROLL:[39+27/60+50.440/3600,-(75+18/60+35.080/3600)],
 CHPMN:[39+43/60+46.530/3600,-(75+4/60+57.020/3600)],
 PSOUT:[39+50/60+6.140/3600,-(74+55/60+57.160/3600)],
 MKORD:[39+50/60+52.700/3600,-(74+52/60+11.410/3600)],
 TRNBL:[39.5694444,-75.54325],
 WEVVE:[39+41/60+31.350/3600,-(75+36/60+27.250/3600)],
 ERNYY:[39+40/60+31.190/3600,-(75+41/60+28.220/3600)],
 MEEAT:[41+12/60+6.690/3600,-(81+43/60+57.360/3600)],
 CLAPT:[41+22/60+20.630/3600,-(81+43/60+32.220/3600)],
 ARYIA:[39+28/60+33.220/3600,-(77+13/60+50.970/3600)]
};
function pt(name){const a=P[name];return{name,latitude:a[0],longitude:a[1]};}
function clean(xs){return(xs||[]).filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))).map(x=>({name:x.name,latitude:Number(x.latitude),longitude:Number(x.longitude)}));}
function through(xs,name){const i=xs.findIndex(x=>x.name===name);if(i<0)throw new Error('decision fix not found '+name);return xs.slice(0,i+1);}
function airport(xs){return xs.at(-1);}
function branchExact(xs,proc,rwy){const apt=airport(xs);if(proc==='PAATS4'){if(['26','27L','27R'].includes(rwy))return[...through(xs,'PAATS'),pt('RROLL'),pt('CHPMN'),pt('PSOUT'),pt('MKORD'),apt];if(['09L','09R'].includes(rwy))return[...through(xs,'PAATS'),pt('TRNBL'),pt('WEVVE'),pt('ERNYY'),apt];}if(proc==='ROLLN2'&&['24L','24R'].includes(rwy))return[...through(xs,'STOHN'),pt('MEEAT'),pt('CLAPT'),apt];if(proc==='ANTHM5'&&['15L','15R'].includes(rwy))return[...through(xs,'ANTHM'),pt('ARYIA'),apt];throw new Error('unresolved exact branch '+proc+' '+rwy);}
function branch475(xs,proc){const apt=airport(xs);if(proc==='PAATS4')return[...through(xs,'PAATS'),apt];if(proc==='ROLLN2')return[...through(xs,'STOHN'),apt];throw new Error('no 475 rule '+proc);}
function mean(rows,k='total'){return rows.reduce((a,x)=>a+x[k],0)/rows.length;}
function r4(x){return Math.round(x*10000)/10000;}
function procFor(route){if(/PAATS4/.test(route))return'PAATS4';if(/ROLLN2/.test(route))return'ROLLN2';if(/ANTHM5/.test(route))return'ANTHM5';throw new Error('procedure not found '+route);}
export default async function handler(req,res){try{const s=db(),out=[];for(const fid of FIDS){const j=(await s`select * from flight_jobs where fa_flight_id=${fid}`)[0];if(!j)throw new Error('missing job '+fid);const fc=(await s`select * from flight_captures where flight_job_id=${j.id}::uuid and eligibility='ELIGIBLE' and canonical_route is not null order by captured_at desc limit 1`)[0];const tr=(await s`select * from postflight_tracks where flight_job_id=${j.id}::uuid and source='AEROAPI' limit 1`)[0];const orig=await s`select checkpoint_pct,total_error_km,xtd_km,atd_km from method_a_scores where flight_job_id=${j.id}::uuid order by checkpoint_pct`;if(!fc||!tr||orig.length!==5)throw new Error('missing score inputs '+fid);const base=clean(fc.raw_capture?.protocol?.fixes),actual=clean(tr.points),route=String(fc.route_text||fc.raw_capture?.flight?.route||''),proc=procFor(route),exact=branchExact(base,proc,j.actual_runway_on),rows=methodA(exact,actual);let rep=null;if(REP[fid]!=null){const rr=methodA(branch475(base,proc),actual),m=r4(mean(rr));rep={expected:REP[fid],recomputed:m,diff_km:r4(m-REP[fid]),pass:Math.abs(m-REP[fid])<=0.10};}out.push({fid,ident:j.ident,proc,runway:j.actual_runway_on,original_mean_total_km:r4(mean(orig.map(x=>({total:Number(x.total_error_km)})))),original_baseline_km:Number(fc.baseline_km),corrected_baseline_km:r4(polyKm(exact)),corrected_mean_total_km:r4(mean(rows)),delta_mean_total_km:r4(mean(rows)-mean(orig.map(x=>({total:Number(x.total_error_km)})))),replication_475:rep,corrected_tail:exact.slice(Math.max(0,exact.length-6)).map(x=>x.name),rows});}
const reps=out.filter(x=>x.replication_475),replication_pass=reps.every(x=>x.replication_475.pass);if(!replication_pass)return json(res,409,{ok:false,stop:true,reason:'ENTRY475_REPLICATION_TOLERANCE_FAILED',replication:reps.map(x=>({fid:x.fid,...x.replication_475}))});
const groups={};for(const x of out){const key=x.proc+'/'+x.runway;(groups[key]??=[]).push(x);}const stratified=Object.entries(groups).map(([key,xs])=>({group:key,n:xs.length,original_mean_total_km:r4(xs.reduce((a,x)=>a+x.original_mean_total_km,0)/xs.length),corrected_mean_total_km:r4(xs.reduce((a,x)=>a+x.corrected_mean_total_km,0)/xs.length),mean_delta_km:r4(xs.reduce((a,x)=>a+x.delta_mean_total_km,0)/xs.length)}));json(res,200,{ok:true,stop:false,rule:'AUTHORITATIVE_EXACT_BRANCH_V1',cohort_n:out.length,replication:reps.map(x=>({fid:x.fid,...x.replication_475})),stratified,pooled:{n:out.length,original_mean_total_km:r4(out.reduce((a,x)=>a+x.original_mean_total_km,0)/out.length),corrected_mean_total_km:r4(out.reduce((a,x)=>a+x.corrected_mean_total_km,0)/out.length),mean_delta_km:r4(out.reduce((a,x)=>a+x.delta_mean_total_km,0)/out.length)},flights:out});}catch(e){json(res,500,{ok:false,error:e.message,stack:e.stack})}}
