import fs from"node:fs/promises";
import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes,resolvePoint}from"../api/resolver/faa-nasr.js";
import{resolveFiledRouteUS}from"../api/resolver/faa-route.js";
import{selectDepartureByRunwayAndNextFix}from"../api/resolver/faa-cifp.js";
const rows=[];for(let i=0;i<10;i++){const j=JSON.parse(await fs.readFile(`fixtures/us-holdout-open-once-part-${i}.json`,"utf8"));rows.push(...j.records)}
const U={APT:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip",FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",CIFP:"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip"};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(String(r.status));return new Uint8Array(await r.arrayBuffer())}
const [aptZip,fixZip,navZip,awyZip,cifpZip]=await Promise.all(Object.values(U).map(get));
const index=buildNasrIndexes({aptZip,fixZip,navZip,awyZip});const cifp=strFromU8(unzipSync(cifpZip)["FAACIFP18"]);
const PROC=/^[A-Z]{3,6}[0-9][A-Z0-9]?$/,R=3440.065,rad=Math.PI/180;
function segNm(p,a,b){const lat0=p[0]*rad,cos=Math.cos(lat0),ax=(a[1]-p[1])*rad*cos*R,ay=(a[0]-p[0])*rad*R,bx=(b[1]-p[1])*rad*cos*R,by=(b[0]-p[0])*rad*R,vx=bx-ax,vy=by-ay,den=vx*vx+vy*vy;let t=den?-(ax*vx+ay*vy)/den:0;t=Math.max(0,Math.min(1,t));return Math.hypot(ax+t*vx,ay+t*vy)}
function minTrack(p,tr){let best=Infinity;for(let i=1;i<tr.length;i++)best=Math.min(best,segNm([p.latitude,p.longitude],[tr[i-1].latitude,tr[i-1].longitude],[tr[i].latitude,tr[i].longitude]));return best}
function median(a){const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null}
function branchMatch(pts,tr){if(!pts.length||tr.length<2)return null;const ds=pts.map(p=>minTrack(p,tr)),cov=ds.filter(d=>d<=3).length/ds.length,med=median(ds);return{match:cov>=.75&&med<=3,coverage3:cov,median_nm:med}}
function modalRunway(rs){if(rs.length<5)return null;const m=new Map();for(const x of rs){const k=String(x.runway||"").toUpperCase();if(k)m.set(k,(m.get(k)||0)+1)}const a=[...m.entries()].sort((x,y)=>y[1]-x[1]);if(!a.length||a.length>1&&a[0][1]===a[1][1])return null;return a[0][0]}
let resolverCore=0,resolverScoring=0;
let depDen=0,depCorrect=0,depWrong=0,depHistoryUsed=0,depFallback=0;
const depRows=[];
for(const c of rows){
 const rr=resolveFiledRouteUS({route:c.route,origin:c.origin,destination:c.destination,nasrIndex:index,cifpText:cifp});if(rr.filed_core_valid)resolverCore++;if(rr.scoring_valid)resolverScoring++;
 const toks=String(c.route||"").trim().split(/\s+/).filter(Boolean).map(x=>x.toUpperCase()),old=c.baseline_fixes||[],oldNames=old.map(x=>String(x?.name||"").toUpperCase());
 if(!PROC.test(toks[0]||""))continue;const selector=toks[1],idx=oldNames.indexOf(selector);if(!(idx>1))continue;depDen++;
 const modal=modalRunway(c.prior_departure_runways||[]);let result=null,source="AEROAPI_FALLBACK";
 if(modal){const sel=selectDepartureByRunwayAndNextFix(cifp,{airport:c.origin,procedure:toks[0],runway:modal,nextFix:selector});if(sel.status==="RESOLVED"){const pts=[];let ok=true;for(const n of sel.fixes.slice(0,-1)){const rp=resolvePoint(index,n);if(rp.status!=="RESOLVED"){ok=false;break}pts.push(rp.point)}if(ok&&pts.length){result=branchMatch(pts,c.target_track||[]);if(result){source="HISTORY";depHistoryUsed++}}}}
 if(!result){depFallback++;const pts=old.slice(1,idx).filter(p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude));result=branchMatch(pts,c.target_track||[])}
 if(result?.match)depCorrect++;else depWrong++;
 depRows.push({capture_id:c.baseline_capture_id,ident:c.ident,source,modal_runway:modal,match:result?.match??null,coverage3:result?.coverage3??null,median_nm:result?.median_nm??null});
}
const arrAnswered=rows.filter(x=>x.source?.direction&&x.truth),arrCorrect=arrAnswered.filter(x=>x.arrival_match===true),arrWrong=arrAnswered.length-arrCorrect.length;
const report={freeze_commit:"85c0e2942af3741ff6370c76335293ed57aec254",population:"US_HOLDOUT_100_260903_V1",n:rows.length,collection_errors:rows.filter(x=>x.error).length,resolver:{filed_core_valid:resolverCore,coverage:resolverCore/rows.length,scoring_valid:resolverScoring},departure_terminal:{denominator:depDen,answered:depDen,history_used:depHistoryUsed,aeroapi_fallback:depFallback,correct:depCorrect,wrong:depWrong,accuracy:depDen?depCorrect/depDen:null,wrong_rate:depDen?depWrong/depDen:null},arrival_persistence:{answered:arrAnswered.length,refused:rows.length-arrAnswered.length,correct:arrCorrect.length,wrong:arrWrong,coverage:arrAnswered.length/rows.length,conditional_accuracy:arrAnswered.length?arrCorrect.length/arrAnswered.length:null,overall_correct:arrCorrect.length/rows.length,wrong_answer_rate:arrWrong/rows.length},departure_rows:depRows,arrival_rows:rows.map(x=>({capture_id:x.baseline_capture_id,ident:x.ident,destination:x.destination,qualifying_arrival_count:x.qualifying_arrival_count,source_ident:x.source?.ident||null,source_actual_on:x.source?.actual_on||null,prediction:x.source?.direction||null,truth:x.truth||null,match:x.arrival_match}))};
await fs.mkdir("artifacts",{recursive:true});await fs.writeFile("artifacts/us-holdout-100-open-once-score.json",JSON.stringify(report,null,2));console.log(JSON.stringify({...report,departure_rows:undefined,arrival_rows:undefined},null,2));