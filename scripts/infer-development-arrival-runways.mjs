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
function infer(track,cands){
 if(!track||track.length<2||!cands?.length)return{status:"CANNOT_TELL",reason:"NO_TRACK_OR_RUNWAYS"};
 const end=track.at(-1);
 let start=null;
 for(let i=track.length-2;i>=0;i--){if(hav(track[i],end)>=0.5){start=track[i];break;}}
 if(!start)return{status:"CANNOT_TELL",reason:"NO_FINAL_SEGMENT_0_5NM"};
 const inbound=bearing(start,end);
 const passing=[];
 for(const c of cands){
   const dist=hav(end,[c.lat,c.lon]);
   const err=adiff(inbound,c.alignment);
   const toThreshold=bearing(end,[c.lat,c.lon]);
   const towardErr=adiff(inbound,toThreshold);
   if(dist<=3&&err<=20&&towardErr<=90)passing.push({...c,dist,heading_error:err,toward_error:towardErr,cost:dist+err/20});
 }
 passing.sort((a,b)=>a.cost-b.cost);
 if(!passing.length)return{status:"CANNOT_TELL",reason:"NO_CANDIDATE"};
 if(passing.length>1&&passing[1].cost-passing[0].cost<=0.25)return{status:"CANNOT_TELL",reason:"MARGIN",best:passing[0],second:passing[1]};
 return{status:"INFERRED",runway:passing[0].runway,best:passing[0],candidate_count:passing.length};
}
const rows=[];
for(const c of fixture.cases){
 const out=infer(tracks[c.baseline_capture_id],byAirport.get(c.destination));
 rows.push({capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,...out,
   stored_actual_runway_on:null});
}
const inferred=rows.filter(x=>x.status==="INFERRED"),cannot=rows.filter(x=>x.status==="CANNOT_TELL");
const reasons=Object.fromEntries([...new Set(cannot.map(x=>x.reason))].map(k=>[k,cannot.filter(x=>x.reason===k).length]));
const report={population:fixture.fixture_id,n:rows.length,inferred:inferred.length,cannot_tell:cannot.length,inference_rate:inferred.length/rows.length,cannot_tell_rate:cannot.length/rows.length,reasons,rows};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/arrival-runway-inference-development-v0.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({population:report.population,n:report.n,inferred:report.inferred,cannot_tell:report.cannot_tell,inference_rate:report.inference_rate,reasons:report.reasons,sample_inferred:inferred.slice(0,10),sample_cannot:cannot.slice(0,10)},null,2));
