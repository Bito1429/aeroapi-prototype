import assert from"node:assert/strict";
import{unzipSync,strFromU8}from"fflate";
import{buildNasrIndexes}from"../api/resolver/faa-nasr.js";
import{resolveFiledRouteUS}from"../api/resolver/faa-route.js";

const U={
 FIX:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_FIX_CSV.zip",
 NAV:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_NAV_CSV.zip",
 AWY:"https://nfdc.faa.gov/webContent/28DaySub/extra/03_Sep_2026_AWY_CSV.zip",
 CIFP:"https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip"
};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(String(r.status));return new Uint8Array(await r.arrayBuffer());}
const [fixZip,navZip,awyZip,cifpZip]=await Promise.all(Object.values(U).map(get));
const index=buildNasrIndexes({fixZip,navZip,awyZip});
const cifp=strFromU8(unzipSync(cifpZip)["FAACIFP18"]);

const route="EMMYS8 ZIRKL LEFAM SPI J80 VHP APE JST BOJID4";
const r=resolveFiledRouteUS({route,origin:"KDEN",destination:"KPHL",nasrIndex:index,cifpText:cifp});

const expected=["EMMYS","ZIRKL","LEFAM","SPI","GORDO","JAAVE","VHP","APE","JST","MIROY","COFAX","LOMON","HAR","LRP","TRAGG","BUNTS"];
assert.deepEqual(r.names,expected);
assert.equal(r.filed_core_valid,true);
assert.equal(r.scoring_valid,false);
assert.equal(r.status,"PARTIAL");
assert.equal(r.validity_reason,"RUNWAY_DEPENDENT_TERMINAL_GEOMETRY_NOT_FILED");
assert.equal(r.terminal_ambiguity.arrival_runway_path,"AMBIGUOUS");

console.log(JSON.stringify({ok:true,route,status:r.status,filed_core_valid:r.filed_core_valid,scoring_valid:r.scoring_valid,names:r.names,terminal_ambiguity:r.terminal_ambiguity,arrival_branches:r.arrival.ambiguous_runway_branches},null,2));
