import fs from"node:fs/promises";
import{unzipSync,strFromU8}from"fflate";
import{parse}from"csv-parse/sync";

const fixture=JSON.parse(await fs.readFile("fixtures/us-shadow-100-260903-v1.json","utf8"));
const tracks=JSON.parse(await fs.readFile("fixtures/us-shadow-100-track-geometry-v1.json","utf8")).tracks;
const url="https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip";
const r=await fetch(url);if(!r.ok)throw new Error(String(r.status));
const files=unzipSync(new Uint8Array(await r.arrayBuffer()));
const apt=parse(strFromU8(files["APT_BASE.csv"]),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:true});
const ends=parse(strFromU8(files["APT_RWY_END.csv"]),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:true});
const icaoBySite=new Map(apt.filter(x=>x.ICAO_ID).map(x=>[x.SITE_NO,String(x.ICAO_ID).trim().toUpperCase()]));
const byAirport=new Map();
for(const e of ends){
 const icao=icaoBySite.get(e.SITE_NO); if(!icao)continue;
 const lat=Number(e.LAT_DECIMAL),lon=Number(e.LONG_DECIMAL),align=Number(e.TRUE_ALIGNMENT);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(align))continue;
 if(!byAirport.has(icao))byAirport.set(icao,[]);
 byAirport.get(icao).push({runway:String(e.RWY_END_ID||"").trim().toUpperCase(),lat,lon,alignment:align});
}
const R=3440.065,rad=Math.PI/180,deg=180/Math.PI;
function hav(a,b){
 const p1=a[0]*rad,p2=b[0]*rad,dp=(b[0]-a[0])*rad,dl=(b[1]-a[1])*rad;
 const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function bearing(a,b){
 const p1=a[0]*rad,p2=b[0]*rad,dl=(b[1]-a[1])*rad;
 const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
 return (Math.atan2(y,x)*deg+360)%360;
}
function adiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d;}
function median(a){const s=[...a].sort((x,y)=>x-y);if(!s.length)return null;const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
const rows=[];
for(const c of fixture.cases){
 const tr=tracks[c.baseline_capture_id]||[],cands=byAirport.get(c.destination)||[];
 if(tr.length<2||!cands.length){rows.push({capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,reason:"NO_TRACK_OR_RUNWAYS"});continue;}
 const end=tr.at(-1);
 let start=null;
 for(let i=tr.length-2;i>=0;i--){if(hav(tr[i],end)>=0.5){start=tr[i];break;}}
 const inbound=start?bearing(start,end):null;
 const ranked=cands.map(x=>({
   ...x,
   dist: hav(end,[x.lat,x.lon]),
   heading_error: inbound==null?null:adiff(inbound,x.alignment)
 })).sort((a,b)=>a.dist-b.dist);
 const eligible=ranked.filter(x=>x.dist<=3&&x.heading_error<=20);
 const close=eligible.length>1?eligible.slice().sort((a,b)=>(a.dist+a.heading_error/20)-(b.dist+b.heading_error/20)).slice(0,2):[];
 const parallelClose=close.length===2&&adiff(close[0].alignment,close[1].alignment)<=10;
 rows.push({
   capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,
   nearest_runway:ranked[0]?.runway||null,nearest_dist_nm:ranked[0]?.dist??null,
   inbound_bearing:inbound,
   nearest_heading_error:ranked[0]?.heading_error??null,
   passing_count:eligible.length,
   top_two_passing:close.map(x=>({runway:x.runway,alignment:x.alignment,dist:x.dist,heading_error:x.heading_error})),
   top_two_parallel_same_direction:parallelClose
 });
}
const nearest=rows.map(x=>x.nearest_dist_nm).filter(Number.isFinite).sort((a,b)=>a-b);
const over3=rows.filter(x=>Number.isFinite(x.nearest_dist_nm)&&x.nearest_dist_nm>3);
const marginLike=rows.filter(x=>x.passing_count>1);
const parallel=marginLike.filter(x=>x.top_two_parallel_same_direction);
const report={
 n:rows.length,
 nearest_threshold_distance_nm:{
   median:median(nearest),
   p75:nearest[Math.floor(.75*(nearest.length-1))],
   p90:nearest[Math.floor(.9*(nearest.length-1))],
   max:nearest.at(-1),
   within3:nearest.filter(x=>x<=3).length,
   between3and5:nearest.filter(x=>x>3&&x<=5).length,
   over5:nearest.filter(x=>x>5).length
 },
 multi_candidate:{n:marginLike.length,parallel_same_direction:parallel.length},
 examples_3_5:over3.filter(x=>x.nearest_dist_nm<=5).slice(0,20),
 examples_parallel:parallel.slice(0,20),
 rows
};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/arrival-inference-diagnostics-v0.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({
 nearest_threshold_distance_nm:report.nearest_threshold_distance_nm,
 multi_candidate:report.multi_candidate,
 examples_3_5:report.examples_3_5,
 examples_parallel:report.examples_parallel
},null,2));
