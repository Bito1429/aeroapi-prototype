import assert from"node:assert/strict";
import{unzipSync}from"fflate";
import{buildNasrIndexes,resolveEnrouteNasr}from"../api/resolver/faa-nasr.js";

const SOURCES={
  FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
  NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",
  AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip"
};
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`${r.status} ${url}`);return new Uint8Array(await r.arrayBuffer());}
const [fixZip,navZip,awyZip]=await Promise.all([get(SOURCES.FIX),get(SOURCES.NAV),get(SOURCES.AWY)]);
const index=buildNasrIndexes({fixZip,navZip,awyZip});

const route="EMMYS8 ZIRKL LEFAM SPI J80 VHP APE JST BOJID4";
const result=resolveEnrouteNasr(route,index);
const names=result.geometry.map(x=>x.name);
const expected=["ZIRKL","LEFAM","SPI","GORDO","JAAVE","VHP","APE","JST"];

assert.deepEqual(names,expected);
assert.deepEqual(result.deferred_procedures,["EMMYS8","BOJID4"]);
assert.equal(result.unresolved.length,0);
assert.equal(result.status,"VALID_ENROUTE");

console.log(JSON.stringify({
  ok:true,
  flight:"AAL516",
  route,
  status:result.status,
  geometry:result.geometry,
  deferred_procedures:result.deferred_procedures,
  counts:index.counts
},null,2));
