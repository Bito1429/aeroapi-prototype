import{unzipSync,strFromU8}from"fflate";
import{procedureRecords}from"../api/resolver/faa-cifp.js";

const url="https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip";
const r=await fetch(url);if(!r.ok)throw new Error(String(r.status));
const text=strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))["FAACIFP18"]);

const cases=[
 ["MONTN2","KSEA","D"],
 ["DINGO6","KTUS","E"],
 ["HOWRY3","KOMA","E"],
 ["ORRCA1","KRNO","E"],
 ["SERFR4","KSFO","E"],
 ["DBRY5","KCOS","E"],
 ["ZOOMR2","KGEG","E"],
 ["MMARY1","KASE","E"],
 ["BGHRN3","KBIL","E"]
];
const out=cases.map(([procedure,airport,subsection])=>{
  const rows=procedureRecords(text,{airport,procedure,subsection});
  const rawHits=text.split(/\r?\n/).filter(x=>x.includes(procedure));
  const family=procedure.replace(/\d+$/,"");
  const familyHits=text.split(/\r?\n/).filter(x=>x.includes(family)).slice(0,30);
  return{procedure,airport,subsection,parsed_records:rows.length,raw_exact_hits:rawHits.length,
    exact_airports:[...new Set(rawHits.map(x=>x.slice(6,10).trim()))],
    family_sample:familyHits.map(x=>x.slice(6,25))};
});
console.log(JSON.stringify(out,null,2));
