import crypto from "node:crypto";
import{aero,json,havKm,polyKm}from"./lib.js";

const OPS=["RYR","EZY","EXS","WZZ"];
const WINDOW_START=new Date("2026-08-15T00:00:00Z");
const WINDOW_END=new Date("2026-09-29T00:00:00Z");
const CUTOFF_MS=new Date("2026-09-28T23:59:59Z").getTime();
const RESAMPLE_N=101;
const ROUTE_PCTS=[20,40,60,80,95];
const ETA_PCTS=[20,40,60,80];
const TARGET_PER_STRATUM=15;
const MAX_PAGES=250;

// Frozen geography: EU-27 + UK + Norway + Switzerland + Iceland.
// GC is included for Spain's Canary Islands.
const ALLOWED_PREFIXES=new Set([
 "LO","EB","LB","LD","LC","LK","EK","EE","EF","LF","ED","LG","LH","EI","LI",
 "EV","EY","EL","LM","EH","EP","LP","LR","LZ","LJ","LE","GC","ES","EG","EN","LS","BI"
]);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const code=x=>x?.code_icao||x?.code||x||"";
const isoMs=x=>{const n=typeof x==="number"?x:new Date(x).getTime();return Number.isFinite(n)?n:null;};
const posMs=x=>{if(typeof x==="number")return x>1e12?x:x*1000;const n=new Date(x).getTime();return Number.isFinite(n)?n:null;};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function percentile(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.min(s.length-1,Math.ceil(p*s.length)-1))];}
function r3(x){return x==null?null:+x.toFixed(3);}
function routeKey(op,f){return [op,String(f.ident_icao||f.ident||""),code(f.origin),code(f.destination)].join("|");}
function hashKey(k){return crypto.createHash("sha256").update(k).digest("hex");}
function insideGeo(icao){return icao&&ALLOWED_PREFIXES.has(String(icao).slice(0,2).toUpperCase());}
function isPrimaryOperated(op,f){
 const operator=String(f.operator_icao||f.operator||"").toUpperCase();
 const ident=String(f.ident_icao||f.ident||"").toUpperCase();
 return operator===op&&ident.startsWith(op);
}
function completedBeforeCutoff(f){
 const on=isoMs(f.actual_on||f.actual_in);
 return on!=null&&on<=CUTOFF_MS&&/arriv/i.test(String(f.status||""));
}
function compactOcc(op,f){
 return{
  op,
  fa_flight_id:f.fa_flight_id,
  ident:String(f.ident_icao||f.ident||""),
  origin:code(f.origin),
  destination:code(f.destination),
  scheduled_out:f.scheduled_out,
  scheduled_in:f.scheduled_in,
  actual_off:f.actual_off||null,
  actual_on:f.actual_on||null
 };
}
async function fetchOperatorDay(op,start,end){
 let path="/history/operators/"+op+"/flights",params={start,end,max_pages:MAX_PAGES};
 const all=[];let guard=0;
 while(path&&guard++<10){
  const b=await aero(path,params);
  all.push(...(b.flights||[]));
  path=b.links?.next||null;
  params={};
 }
 if(path)throw new Error("pagination guard exceeded for "+op+" "+start);
 return all;
}
async function mapLimit(items,limit,fn){
 const out=new Array(items.length);let i=0;
 async function worker(){while(true){const k=i++;if(k>=items.length)return;out[k]=await fn(items[k],k);}}
 await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
 return out;
}
function cleanTrack(body){
 const raw=body.positions||body.track||[];
 const pts=[];
 for(const p of raw){
  const latitude=Number(p.latitude),longitude=Number(p.longitude),t=posMs(p.timestamp);
  if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&t!=null)pts.push({latitude,longitude,t});
 }
 pts.sort((a,b)=>a.t-b.t);
 return pts;
}
function atFraction(points,f){
 if(!points.length)return null;
 const total=polyKm(points),target=total*f;
 if(!Number.isFinite(total)||total<=0)return points[0];
 let d=0;
 for(let i=1;i<points.length;i++){
  const leg=havKm(points[i-1],points[i]);
  if(d+leg>=target){
   const q=leg?((target-d)/leg):0;
   return{
    latitude:points[i-1].latitude+(points[i].latitude-points[i-1].latitude)*q,
    longitude:points[i-1].longitude+(points[i].longitude-points[i-1].longitude)*q,
    t:points[i-1].t+(points[i].t-points[i-1].t)*q
   };
  }
  d+=leg;
 }
 return points.at(-1);
}
function resample(points,n=RESAMPLE_N){return Array.from({length:n},(_,i)=>atFraction(points,i/(n-1)));}
function medianPoint(points){
 return{latitude:median(points.map(x=>x.latitude)),longitude:median(points.map(x=>x.longitude))};
}
function medianPath(tracks){
 const rs=tracks.map(t=>resample(t));
 return Array.from({length:RESAMPLE_N},(_,i)=>medianPoint(rs.map(r=>r[i])));
}
function toVec(p){
 const lat=p.latitude*Math.PI/180,lon=p.longitude*Math.PI/180,c=Math.cos(lat);
 return[c*Math.cos(lon),c*Math.sin(lon),Math.sin(lat)];
}
function fromVec(v){
 const n=Math.hypot(...v),x=v[0]/n,y=v[1]/n,z=v[2]/n;
 return{latitude:Math.atan2(z,Math.hypot(x,y))*180/Math.PI,longitude:Math.atan2(y,x)*180/Math.PI};
}
function greatCircle(a,b,n=RESAMPLE_N){
 const va=toVec(a),vb=toVec(b),dot=Math.max(-1,Math.min(1,va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2])),om=Math.acos(dot);
 if(om<1e-9)return Array.from({length:n},()=>({...a}));
 return Array.from({length:n},(_,i)=>{
  const f=i/(n-1),s=Math.sin(om),u=Math.sin((1-f)*om)/s,v=Math.sin(f*om)/s;
  return fromVec([u*va[0]+v*vb[0],u*va[1]+v*vb[1],u*va[2]+v*vb[2]]);
 });
}
function minToPolylineKm(p,line){
 const lat0=p.latitude*Math.PI/180,kLat=111.195,kLon=111.195*Math.cos(lat0);let best=Infinity;
 for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],ax=(a.longitude-p.longitude)*kLon,ay=(a.latitude-p.latitude)*kLat,bx=(b.longitude-p.longitude)*kLon,by=(b.latitude-p.latitude)*kLat,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  let t=den?-(ax*dx+ay*dy)/den:0;t=Math.max(0,Math.min(1,t));
  best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
 }
 return best;
}
function flightMeanXtd(pred,actual){
 const vals=ROUTE_PCTS.map(p=>minToPolylineKm(atFraction(actual,p/100),pred));
 return mean(vals);
}
function metricSummary(vals){
 return{n:vals.length,median:r3(median(vals)),mean:r3(mean(vals)),p90:r3(percentile(vals,.9)),within_15_pct:r3(100*vals.filter(x=>x<=15).length/vals.length),within_50_pct:r3(100*vals.filter(x=>x<=50).length/vals.length)};
}
function etaSummary(errors){
 const abs=errors.map(x=>Math.abs(x));
 return{n:errors.length,median_abs_min:r3(median(abs)),mean_abs_min:r3(mean(abs)),p90_abs_min:r3(percentile(abs,.9)),mean_signed_min:r3(mean(errors)),within_5_pct:r3(100*abs.filter(x=>x<=5).length/abs.length),within_10_pct:r3(100*abs.filter(x=>x<=10).length/abs.length),within_15_pct:r3(100*abs.filter(x=>x<=15).length/abs.length)};
}
async function loadRouteCandidate(cand){
 const occ=[...cand.occ].sort((a,b)=>new Date(a.scheduled_out)-new Date(b.scheduled_out));
 if(occ.length!==9)return{ok:false,reason:"occurrence_count"};
 if(occ.some(o=>!o.actual_off||!o.actual_on||isoMs(o.actual_on)<=isoMs(o.actual_off)))return{ok:false,reason:"missing_actual_off_on"};
 const got=await mapLimit(occ,9,async o=>{
  try{const b=await aero("/history/flights/"+encodeURIComponent(o.fa_flight_id)+"/track");const points=cleanTrack(b);return{...o,points};}
  catch(e){return{...o,points:[],track_error:e.message};}
 });
 if(got.some(x=>x.points.length<2))return{ok:false,reason:"missing_or_short_track"};
 return{ok:true,key:cand.key,hash:cand.hash,sector:cand.sector,flights:got};
}
function evaluateRoute(route){
 const tr=route.flights.slice(0,6),ev=route.flights.slice(6);
 const med=medianPath(tr.map(x=>x.points));
 const recent=tr[5].points;
 const starts=tr.map(x=>x.points[0]),ends=tr.map(x=>x.points.at(-1));
 const gc=greatCircle(medianPoint(starts),medianPoint(ends));
 const airborneMedian=median(tr.map(x=>(isoMs(x.actual_on)-isoMs(x.actual_off))/60000));
 const remByPct={};
 for(const pct of ETA_PCTS){
  remByPct[pct]=median(tr.map(x=>{
   const cp=atFraction(x.points,pct/100);
   return(isoMs(x.actual_on)-cp.t)/60000;
  }));
 }
 return ev.map(x=>{
  const on=isoMs(x.actual_on),off=isoMs(x.actual_off);
  const eta={takeoff:(off+airborneMedian*60000-on)/60000};
  for(const pct of ETA_PCTS){
   const cp=atFraction(x.points,pct/100);
   eta[String(pct)]=(cp.t+remByPct[pct]*60000-on)/60000;
  }
  return{
   route_key:route.key,
   sector:route.sector,
   fa_flight_id:x.fa_flight_id,
   scheduled_out:x.scheduled_out,
   route_mean_xtd_km:{
    median_path:r3(flightMeanXtd(med,x.points)),
    most_recent:r3(flightMeanXtd(recent,x.points)),
    great_circle:r3(flightMeanXtd(gc,x.points))
   },
   eta_signed_error_min:Object.fromEntries(Object.entries(eta).map(([k,v])=>[k,r3(v)]))
  };
 });
}

export default async function handler(req,res){
 const started=Date.now();
 try{
  const groups=new Map();
  for(let d=new Date(WINDOW_START);d<WINDOW_END;d=new Date(d.getTime()+86400000)){
   const start=d.toISOString(),end=new Date(d.getTime()+86400000).toISOString();
   const day=await Promise.all(OPS.map(op=>fetchOperatorDay(op,start,end)));
   for(let oi=0;oi<OPS.length;oi++){
    const op=OPS[oi];
    for(const f of day[oi]){
     const o=code(f.origin),dest=code(f.destination);
     if(!f.fa_flight_id||!f.scheduled_out||!f.scheduled_in||!insideGeo(o)||!insideGeo(dest)||o===dest||!isPrimaryOperated(op,f)||!completedBeforeCutoff(f))continue;
     const block=(isoMs(f.scheduled_in)-isoMs(f.scheduled_out))/60000;
     if(!Number.isFinite(block)||block<=0)continue;
     const key=routeKey(op,f),occ=compactOcc(op,f);
     let g=groups.get(key);if(!g)g={key,count:0,occ:[]};
     g.count++;g.occ.push(occ);if(g.occ.length>9)g.occ.shift();groups.set(key,g);
    }
   }
  }

  const candidates=[];
  for(const g of groups.values()){
   if(g.count<9||g.occ.length<9)continue;
   const blocks=g.occ.map(x=>(isoMs(x.scheduled_in)-isoMs(x.scheduled_out))/60000);
   const mb=median(blocks);
   const sector=mb<120?"short":mb<=240?"medium":null;
   if(!sector)continue;
   candidates.push({...g,sector,median_scheduled_block_min:mb,hash:hashKey(g.key)});
  }
  const strata={
   short:candidates.filter(x=>x.sector==="short").sort((a,b)=>a.hash.localeCompare(b.hash)),
   medium:candidates.filter(x=>x.sector==="medium").sort((a,b)=>a.hash.localeCompare(b.hash))
  };
  if(strata.short.length<TARGET_PER_STRATUM||strata.medium.length<TARGET_PER_STRATUM){
   return json(res,422,{ok:false,error:"insufficient qualifying candidate routes",candidate_counts:{short:strata.short.length,medium:strata.medium.length}});
  }

  const selected=[],rejected=[];
  for(const sector of ["short","medium"]){
   for(const cand of strata[sector]){
    if(selected.filter(x=>x.sector===sector).length>=TARGET_PER_STRATUM)break;
    const loaded=await loadRouteCandidate(cand);
    if(loaded.ok)selected.push(loaded);
    else rejected.push({route_key:cand.key,sector,reason:loaded.reason});
   }
   if(selected.filter(x=>x.sector===sector).length<TARGET_PER_STRATUM){
    return json(res,422,{ok:false,error:"insufficient data-complete routes",sector,selected:selected.filter(x=>x.sector===sector).length,rejected});
   }
  }

  const evaluations=selected.flatMap(evaluateRoute);
  const medianVals=evaluations.map(x=>x.route_mean_xtd_km.median_path);
  const recentVals=evaluations.map(x=>x.route_mean_xtd_km.most_recent);
  const gcVals=evaluations.map(x=>x.route_mean_xtd_km.great_circle);
  const etaKeys=["takeoff","20","40","60","80"],eta={};
  for(const k of etaKeys)eta[k]=etaSummary(evaluations.map(x=>x.eta_signed_error_min[k]));

  const routeSummary={
   median_path:metricSummary(medianVals),
   most_recent_track:metricSummary(recentVals),
   great_circle:metricSummary(gcVals)
  };
  const usable=routeSummary.median_path.median<=15&&routeSummary.median_path.within_50_pct>=70;
  const noBetterThanGc=routeSummary.median_path.median>=routeSummary.great_circle.median;
  const routeConclusion=noBetterThanGc||routeSummary.median_path.median>30?"not_usable":usable?"usable":"marginal";

  json(res,200,{
   ok:true,
   protocol_commit:"30796efb80815c74d31a69ea235214cc58a9add9",
   frozen_window:{start:WINDOW_START.toISOString(),cutoff:"2026-09-28T23:59:59Z"},
   geography:"EU-27 + UK + Norway + Switzerland + Iceland; both endpoints required",
   candidate_counts:{all:candidates.length,short:strata.short.length,medium:strata.medium.length},
   selected_routes:selected.map(r=>({route_key:r.key,hash:r.hash,sector:r.sector,flight_ids:r.flights.map(x=>x.fa_flight_id)})),
   rejected_data_incomplete:rejected,
   evaluated_flights:evaluations.length,
   route_summary:routeSummary,
   route_predeclared_conclusion:routeConclusion,
   eta_summary:eta,
   elapsed_seconds:r3((Date.now()-started)/1000),
   evaluations
  });
 }catch(e){
  json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null,elapsed_seconds:r3((Date.now()-started)/1000)});
 }
}
