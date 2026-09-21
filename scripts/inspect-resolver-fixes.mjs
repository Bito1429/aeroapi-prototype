import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes,resolvePoint,expandAirway}from"../api/resolver/faa-nasr.js";
import{procedureRecords}from"../api/resolver/faa-cifp.js";
const U={
APT:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_APT_CSV.zip",
FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",
AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
CIFP:"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip"};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(String(r.status));return new Uint8Array(await r.arrayBuffer())}
const [aptZip,fixZip,navZip,awyZip,cifpZip]=await Promise.all(Object.values(U).map(get));
const index=buildNasrIndexes({aptZip,fixZip,navZip,awyZip});
const cifp=strFromU8(unzipSync(cifpZip)["FAACIFP18"]);
const pts={};for(const k of["ABQ","SEA","ELP","ICT"])pts[k]=resolvePoint(index,k).candidates;
const j86=(index.airwayStrings.get("J86")||[]).map(x=>x.sequence);
const procs={};
for(const [airport,procedure,subsection] of [["KSEA","MONTN2","D"],["KTUS","DINGO6","E"],["KOMA","HOWRY3","E"],["KRNO","ORRCA1","E"],["KSFO","SERFR4","E"],["KCOS","DBRY5","E"],["KGEG","ZOOMR2","E"],["KASE","MMARY1","E"],["KBIL","BGHRN3","E"]]){
 const rows=procedureRecords(cifp,{airport,procedure,subsection});
 procs[airport+":"+procedure]=rows.map(r=>({route_type:r.route_type,transition_id:r.transition_id,sequence:r.sequence,fix_id:r.fix_id,path_terminator:r.path_terminator}));
}
console.log(JSON.stringify({pts,j86,expand_INW_ELP:expandAirway(index,"J86","INW","ELP"),expand_INW_FST:expandAirway(index,"J86","INW","FST"),procs},null,2));