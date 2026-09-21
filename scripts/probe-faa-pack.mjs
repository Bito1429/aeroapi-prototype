import fs from"node:fs/promises";
import crypto from"node:crypto";
import{unzipSync,strFromU8}from"fflate";

const SOURCES={
  FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
  AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
  STAR:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_STAR_CSV.zip"
};

function summarizeCsv(bytes){
  const text=strFromU8(bytes);
  const lines=text.split(/\r?\n/).filter(Boolean);
  return{rows:Math.max(0,lines.length-1),header:lines[0]||null,samples:lines.slice(1,3)};
}
const report={cycle:"260903",generated_at:new Date().toISOString(),sources:{}};
for(const[kind,url]of Object.entries(SOURCES)){
  const r=await fetch(url);
  if(!r.ok)throw new Error(`${kind} download failed: ${r.status}`);
  const zip=new Uint8Array(await r.arrayBuffer());
  const files=unzipSync(zip);
  const csvs={};
  for(const[name,bytes]of Object.entries(files)){
    if(/\.csv$/i.test(name))csvs[name]=summarizeCsv(bytes);
  }
  report.sources[kind]={
    url,zip_bytes:zip.length,
    sha256:crypto.createHash("sha256").update(zip).digest("hex"),
    files:Object.keys(files),csvs
  };
}
await fs.mkdir("artifacts",{recursive:true});
await fs.writeFile("artifacts/faa-pack-260903-summary.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
