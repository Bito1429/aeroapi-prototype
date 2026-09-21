import fs from"node:fs/promises";
import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes}from"../api/resolver/faa-nasr.js";
import{resolveFiledRouteUS}from"../api/resolver/faa-route.js";

const fixture=JSON.parse(await fs.readFile("fixtures/us-shadow-100-260903-v1.json","utf8"));
const U={
  APT:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip",
  FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
  NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",
  AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
  CIFP:"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip"
};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(`${r.status} ${u}`);return new Uint8Array(await r.arrayBuffer());}
const [aptZip,fixZip,navZip,awyZip,cifpZip]=await Promise.all(Object.values(U).map(get));
const index=buildNasrIndexes({aptZip,fixZip,navZip,awyZip});
const cifp=strFromU8(unzipSync(cifpZip)["FAACIFP18"]);

function classify(r){
  const ambiguousProblem=r.problems?.some(p=>String(p.status||"").includes("AMBIGUOUS"));
  const ambiguousProcedure=[r.departure?.status,r.arrival?.status].some(s=>s==="AMBIGUOUS");
  if(ambiguousProblem||ambiguousProcedure)return"AMBIGUOUS_IDENTIFIER";
  if((r.problems?.length||0)>0)return"GENUINELY_UNRESOLVED";
  if(r.scoring_valid&&r.status==="VALID")return"DETERMINISTIC_FULL_ROUTE";
  if(r.filed_core_valid&&(r.terminal_ambiguity?.departure_runway_path||r.terminal_ambiguity?.arrival_runway_path))
    return"DETERMINISTIC_FILED_CORE_WITH_TERMINAL_AMBIGUITY";
  return"GENUINELY_UNRESOLVED";
}

const results=fixture.cases.map(c=>{
  const r=resolveFiledRouteUS({
    route:c.route,origin:c.origin,destination:c.destination,nasrIndex:index,cifpText:cifp
  });
  const bucket=classify(r);
  return{
    ...c,bucket,status:r.status,validity_reason:r.validity_reason,
    filed_core_valid:r.filed_core_valid,scoring_valid:r.scoring_valid,
    deterministic_point_count:r.geometry?.length||0,
    terminal_ambiguity:r.terminal_ambiguity,
    problems:r.problems,
    departure_status:r.departure?.status||null,
    arrival_status:r.arrival?.status||null
  };
});
const counts=Object.fromEntries([
  "DETERMINISTIC_FULL_ROUTE",
  "DETERMINISTIC_FILED_CORE_WITH_TERMINAL_AMBIGUITY",
  "GENUINELY_UNRESOLVED",
  "AMBIGUOUS_IDENTIFIER"
].map(k=>[k,results.filter(x=>x.bucket===k).length]));

const problemReasons={};
for(const x of results){
  for(const p of x.problems||[]){
    const k=`${p.stage||"UNKNOWN"}:${p.status||p.reason||"UNKNOWN"}`;
    problemReasons[k]=(problemReasons[k]||0)+1;
  }
}
const ambiguousTokens={},unresolvedDepartures={},unresolvedArrivals={};
for(const x of results){
  for(const p of x.problems||[]){
    if(String(p.status||"").includes("AMBIGUOUS")){
      const k=String(p.token||p.name||"UNKNOWN"); ambiguousTokens[k]=(ambiguousTokens[k]||0)+1;
    }
  }
  const toks=String(x.route||"").split(/\s+/).filter(Boolean);
  if(x.departure_status==="UNRESOLVED"){
    const k=toks[0]||"UNKNOWN"; unresolvedDepartures[k]=(unresolvedDepartures[k]||0)+1;
  }
  if(x.arrival_status==="UNRESOLVED"){
    const k=toks.at(-1)||"UNKNOWN"; unresolvedArrivals[k]=(unresolvedArrivals[k]||0)+1;
  }
}
const report={
  fixture_id:fixture.fixture_id,
  airac_cycle:fixture.airac_cycle,
  n:results.length,
  counts,
  problem_reasons:problemReasons,
  ambiguous_tokens:ambiguousTokens,
  unresolved_departures:unresolvedDepartures,
  unresolved_arrivals:unresolvedArrivals,
  results
};
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/us-shadow-100-260903-v1-results.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({fixture_id:report.fixture_id,n:report.n,counts:report.counts,problem_reasons:report.problem_reasons,ambiguous_tokens:report.ambiguous_tokens,unresolved_departures:report.unresolved_departures,unresolved_arrivals:report.unresolved_arrivals,
  examples:Object.fromEntries(Object.keys(counts).map(k=>[k,results.filter(x=>x.bucket===k).slice(0,5).map(x=>({ident:x.ident,origin:x.origin,destination:x.destination,route:x.route,problems:x.problems,terminal_ambiguity:x.terminal_ambiguity}))]))
},null,2));
