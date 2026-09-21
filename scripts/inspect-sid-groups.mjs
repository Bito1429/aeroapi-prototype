import{unzipSync,strFromU8}from"fflate";
import{procedureRecords}from"../api/resolver/faa-cifp.js";
const url="https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip";
const r=await fetch(url);if(!r.ok)throw new Error(String(r.status));
const text=strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))["FAACIFP18"]);
const cases=[["KSLC","ZIONZ1"],["KLAS","NIITZ4"],["KPHX","KEENS3"],["KLAS","GIDGT4"],["KDEN","DDRTH1"]];
const out={};
for(const [airport,procedure] of cases){
 const rows=procedureRecords(text,{airport,procedure,subsection:"D"});
 const groups={};
 for(const x of rows){
   const k=`${x.route_type}|${x.transition_id}`;
   (groups[k]??=[]).push(x.fix_id);
 }
 out[`${airport}:${procedure}`]=groups;
}
console.log(JSON.stringify(out,null,2));
