import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes}from"../api/resolver/faa-nasr.js";
import{resolveFiledRouteUS}from"../api/resolver/faa-route.js";

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

const cases=[
 {ident:"ASA701",origin:"KLAS",destination:"KSEA",route:"JOHKR5 KENNO OAL LOMIA LKV HAWKZ8"},
 {ident:"DAL1553",origin:"KSLC",destination:"KDEN",route:"RUGGD3 PERTY KAMPR LONGZ4"},
 {ident:"FFT3174",origin:"KORD",destination:"KDEN",route:"OLINN OREOS OBENE OGALE BRWRY LAWGR4"}
];
const out=cases.map(x=>{
 const r=resolveFiledRouteUS({...x,nasrIndex:index,cifpText:cifp});
 return{...x,status:r.status,filed_core_valid:r.filed_core_valid,scoring_valid:r.scoring_valid,names:r.names,terminal_ambiguity:r.terminal_ambiguity,problems:r.problems,departure:r.departure,arrival:r.arrival};
});
console.log(JSON.stringify(out,null,2));
