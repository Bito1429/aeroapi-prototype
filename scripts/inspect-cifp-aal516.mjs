import{unzipSync,strFromU8}from"fflate";

const URL="https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip";
const r=await fetch(URL);
if(!r.ok)throw new Error(`CIFP download failed: ${r.status}`);
const zip=new Uint8Array(await r.arrayBuffer());
const files=unzipSync(zip);
const raw=strFromU8(files["FAACIFP18"]);
const lines=raw.split(/\r?\n/).filter(Boolean);

function hits(term){
  return lines.filter(x=>x.includes(term)).slice(0,80).map(x=>({
    length:x.length,
    line:x
  }));
}
const out={
  total_lines:lines.length,
  line_lengths:[...new Set(lines.slice(0,5000).map(x=>x.length))].sort((a,b)=>a-b),
  EMMYS:hits("EMMYS"),
  BOJID:hits("BOJID"),
  ZIRKL:hits("ZIRKL"),
  HIFAL:hits("HIFAL")
};
console.log(JSON.stringify(out,null,2));
