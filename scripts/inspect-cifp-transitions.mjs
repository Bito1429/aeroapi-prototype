import{unzipSync,strFromU8}from"fflate";
const URL="https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip";
const r=await fetch(URL);if(!r.ok)throw new Error(String(r.status));
const raw=strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))["FAACIFP18"]);
const lines=raw.split(/\r?\n/).filter(Boolean);

const emm=lines.filter(x=>x.startsWith("SUSAP KDEN")&&x.includes("EMMYS8"));
const boj=lines.filter(x=>x.startsWith("SUSAP KPHL")&&x.includes("BOJID4"));

function compact(rows){
  return rows.map((line,idx)=>({
    idx,
    c1_10:line.slice(0,10),
    c11_20:line.slice(10,20),
    c21_30:line.slice(20,30),
    c31_40:line.slice(30,40),
    c41_50:line.slice(40,50),
    c51_60:line.slice(50,60),
    raw:line
  }));
}
console.log(JSON.stringify({
  EMMYS8_count:emm.length,
  EMMYS8_ZIRKL:compact(emm.filter(x=>x.includes("ZIRKL"))),
  EMMYS8_last40:compact(emm.slice(-40)),
  BOJID4_count:boj.length,
  BOJID4_JST:compact(boj.filter(x=>x.includes("JST"))),
  BOJID4_all:compact(boj)
},null,2));
