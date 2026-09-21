import{unzipSync,strFromU8}from"fflate";
import{json}from"./lib.js";
import crypto from"node:crypto";

const SOURCES={
  FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
  AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
  STAR:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_STAR_CSV.zip"
};

function csvSummary(text){
  const lines=text.split(/\r?\n/).filter(Boolean);
  return{rows:Math.max(0,lines.length-1),header:lines[0]||null,sample:lines.slice(1,3)};
}

export default async function handler(req,res){
  const out={cycle:"260903",sources:{}};
  for(const [kind,url] of Object.entries(SOURCES)){
    const r=await fetch(url);
    if(!r.ok)return json(res,502,{ok:false,kind,status:r.status,url});
    const buf=new Uint8Array(await r.arrayBuffer());
    const files=unzipSync(buf);
    const names=Object.keys(files);
    const csvs=names.filter(n=>/\.csv$/i.test(n));
    out.sources[kind]={
      url,
      zip_bytes:buf.length,
      sha256:crypto.createHash("sha256").update(buf).digest("hex"),
      files:names,
      csvs:Object.fromEntries(csvs.map(n=>[n,csvSummary(strFromU8(files[n]))]))
    };
  }
  return json(res,200,{ok:true,...out});
}
