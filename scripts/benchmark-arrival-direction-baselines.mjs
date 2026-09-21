import fs from"node:fs/promises";
import{unzipSync,strFromU8}from"fflate";
import{parse}from"csv-parse/sync";

const dev=JSON.parse(await fs.readFile("fixtures/us-shadow-100-260903-v1.json","utf8"));
const devTracks=JSON.parse(await fs.readFile("fixtures/us-shadow-100-track-geometry-v1.json","utf8")).tracks;
const hist=JSON.parse(await fs.readFile("fixtures/us-arrival-history-14d-final-segments-v1.json","utf8"));
const validation=JSON.parse(await fs.readFile("fixtures/aeroapi-actual-runway-on-validation-v1.json","utf8"));

const url="https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip";
const rr=await fetch(url);if(!rr.ok)throw new Error(String(rr.status));
const files=unzipSync(new Uint8Array(await rr.arrayBuffer()));
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
function hav(a,b){const p1=a[0]*rad,p2=b[0]*rad,dp=(b[0]-a[0])*rad,dl=(b[1]-a[1])*rad;const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function bearing(a,b){const p1=a[0]*rad,p2=b[0]*rad,dl=(b[1]-a[1])*rad;const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)*deg+360)%360;}
function adiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d;}
function circMean(degs){const sx=degs.reduce((s,x)=>s+Math.cos(rad*x),0),sy=degs.reduce((s,x)=>s+Math.sin(rad*x),0);return(Math.atan2(sy,sx)*deg+360)%360;}
function finalSegment(track){
 if(!track||track.length<2)return null;
 const end=Array.isArray(track.at(-1))?track.at(-1):[track.at(-1).latitude,track.at(-1).longitude];
 for(let i=track.length-2;i>=0;i--){
   const p=Array.isArray(track[i])?track[i]:[track[i].latitude,track[i].longitude];
   if(hav(p,end)>=0.5)return[p,end];
 }
 return null;
}
function inferDirection(start,end,cands){
 if(!start||!end||!cands?.length)return null;
 const inbound=bearing(start,end),eligible=[];
 for(const c of cands){
   const dist=hav(end,[c.lat,c.lon]),err=adiff(inbound,c.alignment);
   if(dist<=3&&err<=20)eligible.push({...c,dist,heading_error:err,cost:dist+err/20});
 }
 if(!eligible.length)return null;
 const fams=[];
 for(const c of eligible.sort((a,b)=>a.alignment-b.alignment)){
   let fam=fams.find(f=>f.members.some(m=>adiff(m.alignment,c.alignment)<=10));
   if(!fam){fam={members:[]};fams.push(fam);} fam.members.push(c);
 }
 for(const f of fams){f.alignment=circMean(f.members.map(x=>x.alignment));f.runways=f.members.map(x=>x.runway).sort();f.cost=Math.min(...f.members.map(x=>x.cost));}
 fams.sort((a,b)=>a.cost-b.cost);
 if(fams.length>1&&fams[1].cost-fams[0].cost<=0.25)return null;
 return{alignment:fams[0].alignment,runways:fams[0].runways,key:fams[0].runways.join("/")};
}
function match(a,b){return a&&b&&adiff(a.alignment,b.alignment)<=10;}

// 1) sparse stored-label validation.
const valRows=[];
for(const x of validation.records){
 const pts=(x.tail_points||[]).filter(p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)).map(p=>[p.latitude,p.longitude]);
 const seg=finalSegment(pts);
 const inf=seg?inferDirection(seg[0],seg[1],byAirport.get(x.destination)):null;
 const actual=(byAirport.get(x.destination)||[]).find(r=>r.runway===String(x.actual_runway_on||"").toUpperCase());
 const agrees=!!(inf&&actual&&adiff(inf.alignment,actual.alignment)<=10);
 valRows.push({flight_job_id:x.flight_job_id,destination:x.destination,actual_runway_on:x.actual_runway_on,actual_alignment:actual?.alignment??null,inferred_alignment:inf?.alignment??null,inferred_family:inf?.runways??null,agrees});
}
const valComparable=valRows.filter(x=>x.actual_alignment!=null&&x.inferred_alignment!=null);
const labelValidation={n:validation.records.length,comparable:valComparable.length,agreements:valComparable.filter(x=>x.agrees).length,agreement_rate:valComparable.length?valComparable.filter(x=>x.agrees).length/valComparable.length:null,rows:valRows};

// 2) infer historical direction families once.
const histRows=[];
for(const x of hist.records){
 const inf=inferDirection(x.start,x.end,byAirport.get(x.destination));
 if(inf)histRows.push({...x,direction:inf});
}

// 3) ground truth labels for development set.
const truths=new Map();
for(const c of dev.cases){
 const seg=finalSegment(devTracks[c.baseline_capture_id]||[]);
 if(seg){const inf=inferDirection(seg[0],seg[1],byAirport.get(c.destination));if(inf)truths.set(String(c.baseline_capture_id),inf);}
}

function ageStats(rows){
 const a=rows.filter(x=>x.prediction&&Number.isFinite(x.age_minutes)).map(x=>x.age_minutes).sort((x,y)=>x-y);
 if(!a.length)return{n:0,median:null,p75:null,p90:null,max:null};
 const q=p=>a[Math.min(a.length-1,Math.floor(p*(a.length-1)))];
 return{n:a.length,median:q(.5),p75:q(.75),p90:q(.9),max:a.at(-1)};
}
function durationBin(minutes){
 if(!Number.isFinite(minutes))return"UNKNOWN";
 if(minutes<=120)return"SHORT_LE120";
 if(minutes<=240)return"MEDIUM_121_240";
 return"LONG_GT240";
}
function summarize(rows){
 const answered=rows.filter(x=>x.prediction),matched=answered.filter(x=>x.match);
 return{
   denominator:rows.length,
   answered:answered.length,
   refused:rows.length-answered.length,
   matched:matched.length,
   wrong:answered.length-matched.length,
   coverage:answered.length/rows.length,
   conditional_accuracy:answered.length?matched.length/answered.length:null,
   overall_correct_rate:matched.length/rows.length,
   refusal_rate:(rows.length-answered.length)/rows.length,
   wrong_answer_rate:(answered.length-matched.length)/rows.length
 };
}

const modalRows=[],persistRows=[],persist3Rows=[],persist4Rows=[];
for(const c of dev.cases){
 const T=new Date(c.captured_at).getTime(),truth=truths.get(String(c.baseline_capture_id));
 if(!truth)continue;
 const prior=histRows.filter(x=>x.destination===c.destination&&new Date(x.track_captured_at).getTime()<T);

 const m14=prior.filter(x=>new Date(x.track_captured_at).getTime()>=T-14*24*3600e3);
 let mp=null,mreason=null;
 if(m14.length<5)mreason="LT5_PRIOR";
 else{
   const counts=new Map();
   for(const x of m14){const k=x.direction.key;const z=counts.get(k)||{n:0,direction:x.direction};z.n++;counts.set(k,z);}
   const ranked=[...counts.values()].sort((a,b)=>b.n-a.n);
   if(ranked.length>1&&ranked[0].n===ranked[1].n)mreason="MODE_TIE";
   else mp=ranked[0]?.direction||null;
 }
 modalRows.push({capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,truth,prediction:mp,match:mp?match(mp,truth):null,reason:mreason,prior_n:m14.length});

 const buildPersist=(hours,label)=>{
   const p=prior.filter(x=>new Date(x.track_captured_at).getTime()>=T-hours*3600e3).sort((a,b)=>new Date(b.track_captured_at)-new Date(a.track_captured_at));
   const pred=p[0]?.direction||null;
   const raw=hist.records.filter(x=>x.destination===c.destination&&new Date(x.track_captured_at).getTime()<T&&new Date(x.track_captured_at).getTime()>=T-hours*3600e3);
   const reason=pred?null:(raw.length?"ARRIVALS_BUT_NO_VALID_DIRECTION":`NO_ARRIVAL_${label}`);
   return {capture_id:c.baseline_capture_id,ident:c.ident,destination:c.destination,truth,prediction:pred,match:pred?match(pred,truth):null,reason,prior_n:p.length,raw_prior_n:raw.length,age_minutes:pred?(T-new Date(p[0].track_captured_at).getTime())/60000:null,scheduled_minutes:Number(c.scheduled_minutes),duration_bin:durationBin(Number(c.scheduled_minutes))};
 };
 persistRows.push(buildPersist(2,"2H"));
 persist3Rows.push(buildPersist(3,"3H"));
 persist4Rows.push(buildPersist(4,"4H"));
}
const durationSummary=rows=>Object.fromEntries(["SHORT_LE120","MEDIUM_121_240","LONG_GT240","UNKNOWN"].map(bin=>{
 const r=rows.filter(x=>x.duration_bin===bin);
 return [bin,{n:r.length,...summarize(r)}];
}));
const persistence_by_duration=durationSummary(persistRows);
const persistence3_by_duration=durationSummary(persist3Rows);
const persistence4_by_duration=durationSummary(persist4Rows);
const legacy_unused=Object.fromEntries(["SHORT_LE120","MEDIUM_121_240","LONG_GT240","UNKNOWN"].map(bin=>{
 const r=persistRows.filter(x=>x.duration_bin===bin);
 return [bin,{n:r.length,...summarize(r)}];
}));
const persistence_refusals_by_reason={};
const persistence_refusals_by_destination={};
for(const x of persistRows.filter(x=>!x.prediction)){
 persistence_refusals_by_reason[x.reason]=(persistence_refusals_by_reason[x.reason]||0)+1;
 persistence_refusals_by_destination[x.destination]=(persistence_refusals_by_destination[x.destination]||0)+1;
}
const report={
 population:dev.fixture_id,
 ground_truth_labels:truths.size,
 historical_labels:histRows.length,
 label_validation:labelValidation,
 modal_14d:{...summarize(modalRows),rows:modalRows},
 persistence_2h:{...summarize(persistRows),age_stats:ageStats(persistRows),by_duration:persistence_by_duration,refusals_by_reason:persistence_refusals_by_reason,refusals_by_destination:persistence_refusals_by_destination,rows:persistRows},
 persistence_3h:{...summarize(persist3Rows),age_stats:ageStats(persist3Rows),by_duration:persistence3_by_duration,rows:persist3Rows},
 persistence_4h:{...summarize(persist4Rows),age_stats:ageStats(persist4Rows),by_duration:persistence4_by_duration,rows:persist4Rows}
};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/arrival-direction-baselines-development-v0.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({
 population:report.population,
 ground_truth_labels:report.ground_truth_labels,
 historical_labels:report.historical_labels,
 label_validation:{n:labelValidation.n,comparable:labelValidation.comparable,agreements:labelValidation.agreements,agreement_rate:labelValidation.agreement_rate,disagreements:valComparable.filter(x=>!x.agrees)},
 modal_14d:summarize(modalRows),
 persistence_2h:{...summarize(persistRows),age_stats:ageStats(persistRows),by_duration:persistence_by_duration,refusals_by_reason:persistence_refusals_by_reason,top_refusal_destinations:Object.entries(persistence_refusals_by_destination).sort((a,b)=>b[1]-a[1]).slice(0,15)},
 persistence_3h:{...summarize(persist3Rows),age_stats:ageStats(persist3Rows),by_duration:persistence3_by_duration},
 persistence_4h:{...summarize(persist4Rows),age_stats:ageStats(persist4Rows),by_duration:persistence4_by_duration},
 persistence_age_minutes:{median:(()=>{const a=persistRows.filter(x=>x.prediction).map(x=>x.age_minutes).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;})()}
},null,2));
