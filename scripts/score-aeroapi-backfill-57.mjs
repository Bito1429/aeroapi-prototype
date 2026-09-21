import fs from "node:fs/promises";
import {unzipSync,strFromU8} from "fflate";
import {parse} from "csv-parse/sync";
const parts=["0-3","4-7","8-9","10-11"];
const rows=[];
for(const p of parts){const j=JSON.parse(await fs.readFile(`fixtures/aeroapi-history-backfill-57-v0-part-${p}.json`,"utf8"));rows.push(...j.records);}
const dev=JSON.parse(await fs.readFile("fixtures/us-shadow-100-260903-v1.json","utf8"));
const devTracks=JSON.parse(await fs.readFile("fixtures/us-shadow-100-track-geometry-v1.json","utf8")).tracks;
const rr=await fetch("https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip");if(!rr.ok)throw new Error("FAA "+rr.status);
const files=unzipSync(new Uint8Array(await rr.arrayBuffer()));
const apt=parse(strFromU8(files["APT_BASE.csv"]),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:true});
const ends=parse(strFromU8(files["APT_RWY_END.csv"]),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:true});
const icaoBySite=new Map(apt.filter(x=>x.ICAO_ID).map(x=>[x.SITE_NO,String(x.ICAO_ID).trim().toUpperCase()]));
const byAirport=new Map();
for(const e of ends){const icao=icaoBySite.get(e.SITE_NO);if(!icao)continue;const lat=Number(e.LAT_DECIMAL),lon=Number(e.LONG_DECIMAL),align=Number(e.TRUE_ALIGNMENT);if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(align))continue;if(!byAirport.has(icao))byAirport.set(icao,[]);byAirport.get(icao).push({runway:String(e.RWY_END_ID||"").trim().toUpperCase(),lat,lon,alignment:align});}
const R=3440.065,rad=Math.PI/180,deg=180/Math.PI;
function hav(a,b){const p1=a[0]*rad,p2=b[0]*rad,dp=(b[0]-a[0])*rad,dl=(b[1]-a[1])*rad;const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function bearing(a,b){const p1=a[0]*rad,p2=b[0]*rad,dl=(b[1]-a[1])*rad;const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)*deg+360)%360;}
function adiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d;}
function circMean(ds){const sx=ds.reduce((s,x)=>s+Math.cos(rad*x),0),sy=ds.reduce((s,x)=>s+Math.sin(rad*x),0);return(Math.atan2(sy,sx)*deg+360)%360;}
function finalSegment(track){if(!track||track.length<2)return null;const z=track.filter(p=>Number.isFinite(p?.latitude??p?.[0])&&Number.isFinite(p?.longitude??p?.[1]));if(z.length<2)return null;const cv=p=>Array.isArray(p)?p:[p.latitude,p.longitude];const end=cv(z.at(-1));for(let i=z.length-2;i>=0;i--){const p=cv(z[i]);if(hav(p,end)>=0.5)return[p,end];}return null;}
function infer(start,end,cands){if(!start||!end||!cands?.length)return null;const inbound=bearing(start,end),eligible=[];for(const c of cands){const dist=hav(end,[c.lat,c.lon]),err=adiff(inbound,c.alignment);if(dist<=3&&err<=20)eligible.push({...c,dist,heading_error:err,cost:dist+err/20});}if(!eligible.length)return null;const fams=[];for(const c of eligible.sort((a,b)=>a.alignment-b.alignment)){let f=fams.find(f=>f.members.some(m=>adiff(m.alignment,c.alignment)<=10));if(!f){f={members:[]};fams.push(f)}f.members.push(c)}for(const f of fams){f.alignment=circMean(f.members.map(x=>x.alignment));f.runways=f.members.map(x=>x.runway).sort();f.cost=Math.min(...f.members.map(x=>x.cost));}fams.sort((a,b)=>a.cost-b.cost);if(fams.length>1&&fams[1].cost-fams[0].cost<=0.25)return null;return{alignment:fams[0].alignment,runways:fams[0].runways,key:fams[0].runways.join("/")};}
const devMap=new Map(dev.cases.map(c=>[String(c.baseline_capture_id),c]));
const scored=[];
for(const r of rows){const c=devMap.get(String(r.capture_id));const tseg=finalSegment(devTracks[String(r.capture_id)]||[]);const truth=tseg?infer(tseg[0],tseg[1],byAirport.get(r.destination)):null;const pseg=finalSegment(r.top_track?.positions||[]);const pred=pseg?infer(pseg[0],pseg[1],byAirport.get(r.destination)):null;scored.push({...r,truth,prediction:pred,match:pred&&truth?adiff(pred.alignment,truth.alignment)<=10:null});}
const eligible=scored.filter(x=>(x.qualifying_arrivals||[]).length>0);
const answered=eligible.filter(x=>x.prediction&&x.truth);
const matched=answered.filter(x=>x.match);
const report={n:scored.length,qualifying_arrival_cases:eligible.length,true_no_arrival:scored.filter(x=>(x.qualifying_arrivals||[]).length===0).length,top_track_v2_answered:answered.length,top_track_v2_refused:eligible.length-answered.length,matches:matched.length,wrong:answered.length-matched.length,conditional_accuracy:answered.length?matched.length/answered.length:null,incremental_coverage:answered.length/57,combined_existing_plus_backfill_answered:43+answered.length,combined_coverage:(43+answered.length)/100,combined_correct:42+matched.length,combined_wrong:1+(answered.length-matched.length),rows:scored.map(x=>({capture_id:x.capture_id,ident:x.ident,destination:x.destination,captured_at:x.captured_at,qualifying_arrivals:x.qualifying_arrivals?.length||0,source_actual_on:x.qualifying_arrivals?.[0]?.actual_on||null,source_ident:x.qualifying_arrivals?.[0]?.ident||null,prediction:x.prediction,truth:x.truth,match:x.match}))};
await fs.mkdir("artifacts",{recursive:true});await fs.writeFile("artifacts/aeroapi-history-backfill-57-v0-score.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined},null,2));
