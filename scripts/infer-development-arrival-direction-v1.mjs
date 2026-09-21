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
function circMean(degs){
 const xs=degs.map(x=>Math.cos(rad*x)),ys=degs.map(x=>Math.sin(rad*x));
 return (Math.atan2(ys.reduce((a,b)=>a+b,0),xs.reduce((a,b)=>a+b,0))*deg+360)%360;
}
function infer(track,cands){
 if(!track||track.length<2||!cands?.length)return{status:"CANNOT_TELL",reason:"NO_TRACK_OR_RUNWAYS"};
 const end=track.at(-1);
 let start=null;
 for(let i=track.length-2;i>=0;i--){if(hav(track[i],end)>=0.5){start=track[i];break;}}
 if(!start)return{status:"CANNOT_TELL",reason:"NO_FINAL_SEGMENT_0_5NM"};
 const inbound=bearing(start,end);
 const eligible=[];
 for(const c of cands){
   const dist=hav(end,[c.lat,c.lon]);
   const err=adiff(inbound,c.alignment);
   const towardErr=adiff(inbound,bearing(end,[c.lat,c.lon]));
   if(dist<=3&&err<=20&&towardErr<=90)eligible.push({...c,dist,heading_error:err,toward_error:towardErr,cost:dist+err/20});
 }
 if(!eligible.length)return{status:"CANNOT_TELL",reason:"NO_ELIGIBLE_DIRECTION"};

 const fams=[];
 for(const c of eligible.sort((a,b)=>a.alignment-b.alignment)){
   let fam=fams.find(f=>f.members.some(m=>adiff(m.alignment,c.alignment)<=10));
   if(!fam){fam={members:[]};fams.push(fam);}
   fam.members.push(c);
 }
 for(const f of fams){
   f.alignment=circMean(f.members.map(x=>x.alignment));
   f.runways=f.members.map(x=>x.runway).sort();
   f.cost=Math.min(...f.members.map(x=>x.cost));
 }
 fams.sort((a,b)=>a.cost-b.cost);
 if(fams.length===1)return{status:"INFERRED_DIRECTION",direction_alignment_deg:fams[0].alignment,runway_family:fams[0].runways,candidate_family_count:1,cost:fams[0].cost};
 if(fams[1].cost-fams[0].cost<=0.25)return{status:"CANNOT_TELL",reason:"DIRECTION_MARGIN",best:fams[0],second:fams[1],candidate_family_count:fams.length};
 return{status:"INFERRED_DIRECTION",direction_alignment_deg:fams[0].alignment,runway_family:fams[0].runways,candidate_family_count:fams.length,cost:fams[0].cost};
}
const rows=fixture.cases.map(c=>({capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,...infer(tracks[c.baseline_capture_id],byAirport.get(c.destination))}));
const inferred=rows.filter(x=>x.status==="INFERRED_DIRECTION"),cannot=rows.filter(x=>x.status==="CANNOT_TELL");
const reasons={};for(const x of cannot)reasons[x.reason]=(reasons[x.reason]||0)+1;
const report={population:fixture.fixture_id,n:rows.length,inferred:inferred.length,cannot_tell:cannot.length,inference_rate:inferred.length/rows.length,reasons,rows};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/arrival-direction-inference-development-v1.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({population:report.population,n:report.n,inferred:report.inferred,cannot_tell:report.cannot_tell,inference_rate:report.inference_rate,reasons:report.reasons,sample_inferred:inferred.slice(0,12),sample_cannot:cannot.slice(0,12)},null,2));
