import fs from"node:fs/promises";
import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes,resolvePoint}from"../api/resolver/faa-nasr.js";
import{selectDepartureByRunwayAndNextFix}from"../api/resolver/faa-cifp.js";

const fixture=JSON.parse(await fs.readFile("fixtures/us-shadow-100-260903-v1.json","utf8"));
const tracks=JSON.parse(await fs.readFile("fixtures/us-shadow-100-track-geometry-v1.json","utf8")).tracks;
const U={
 APT:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip",
 FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
 NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",
 AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
 CIFP:"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip"
};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(String(r.status));return new Uint8Array(await r.arrayBuffer());}
const [aptZip,fixZip,navZip,awyZip,cifpZip]=await Promise.all(Object.values(U).map(get));
const index=buildNasrIndexes({aptZip,fixZip,navZip,awyZip});
const cifp=strFromU8(unzipSync(cifpZip)["FAACIFP18"]);

const PROC=/^[A-Z]{3,6}[0-9][A-Z0-9]?$/;
const R=3440.065,rad=Math.PI/180;
function segNm(p,a,b){
 const lat0=p[0]*rad,cos=Math.cos(lat0);
 const ax=(a[1]-p[1])*rad*cos*R,ay=(a[0]-p[0])*rad*R;
 const bx=(b[1]-p[1])*rad*cos*R,by=(b[0]-p[0])*rad*R;
 const vx=bx-ax,vy=by-ay,den=vx*vx+vy*vy;
 let t=den?-(ax*vx+ay*vy)/den:0;t=Math.max(0,Math.min(1,t));
 return Math.hypot(ax+t*vx,ay+t*vy);
}
function minTrack(p,tr){let best=Infinity;for(let i=1;i<tr.length;i++)best=Math.min(best,segNm([p.latitude,p.longitude],tr[i-1],tr[i]));return best;}
function median(a){const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null;}

let denominator=0,answered=0,matches=0,wrong=0,refused=0;
const reasons={},rows=[];
for(const c of fixture.cases){
 const route=String(c.route||"").trim().split(/\s+/).filter(Boolean).map(x=>x.toUpperCase());
 const old=c.old_canonical_fixes||[],oldNames=old.map(x=>String(x?.name||"").toUpperCase());
 if(!PROC.test(route[0]||""))continue;
 const selector=route[1];const idx=oldNames.indexOf(selector);
 if(!(idx>1))continue; // same 95-flight evaluable denominator
 denominator++;
 const modal=c.departure_dumb_baseline?.baseline_runway||null;
 if(!modal){refused++;reasons.NO_HISTORY=(reasons.NO_HISTORY||0)+1;continue;}
 const sel=selectDepartureByRunwayAndNextFix(cifp,{airport:c.origin,procedure:route[0],runway:modal,nextFix:selector});
 if(sel.status!=="RESOLVED"){refused++;reasons[sel.reason||sel.status]=(reasons[sel.reason||sel.status]||0)+1;rows.push({ident:c.ident,status:"REFUSE",modal,reason:sel.reason||sel.status});continue;}
 const names=sel.fixes.slice(0,-1); // selector excluded by frozen branch benchmark
 const pts=[];let bad=null;
 for(const n of names){const rp=resolvePoint(index,n);if(rp.status!=="RESOLVED"){bad=`POINT_${rp.status}:${n}`;break;}pts.push(rp.point);}
 if(bad||!pts.length){refused++;reasons[bad||"NO_BRANCH_POINTS"]=(reasons[bad||"NO_BRANCH_POINTS"]||0)+1;continue;}
 const tr=tracks[c.baseline_capture_id]||[];
 if(tr.length<2){refused++;reasons.NO_TRACK=(reasons.NO_TRACK||0)+1;continue;}
 const ds=pts.map(p=>minTrack(p,tr)),cov3=ds.filter(d=>d<=3).length/ds.length,med=median(ds),match=cov3>=.75&&med<=3;
 answered++;if(match)matches++;else wrong++;
 rows.push({ident:c.ident,origin:c.origin,procedure:route[0],modal_runway:modal,n:pts.length,coverage3:cov3,median_nm:med,match,branch_names:names});
}
const report={
 population:fixture.fixture_id,denominator,answered,refused,matches,wrong,
 coverage:answered/denominator,
 conditional_accuracy:answered?matches/answered:null,
 overall_correct_rate:matches/denominator,
 refusal_rate:refused/denominator,
 wrong_answer_rate:wrong/denominator,
 aeroapi_reference:{answered:95,matches:67,coverage:1,conditional_accuracy:67/95,overall_correct_rate:67/95,wrong_answer_rate:28/95},
 refusal_reasons:reasons,
 worst_wrong:rows.filter(x=>x.match===false).sort((a,b)=>b.median_nm-a.median_nm).slice(0,10)
};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/departure-most-used-runway-baseline-v0.json",JSON.stringify({...report,rows},null,2));
console.log(JSON.stringify(report,null,2));
