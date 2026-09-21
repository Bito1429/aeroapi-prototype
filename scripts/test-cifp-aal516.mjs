import assert from"node:assert/strict";
import{unzipSync,strFromU8}from"fflate";
import{selectDepartureByNextFix,selectArrivalByEntryFix}from"../api/resolver/faa-cifp.js";

const url="https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_260903.zip";
const r=await fetch(url);if(!r.ok)throw new Error(String(r.status));
const text=strFromU8(unzipSync(new Uint8Array(await r.arrayBuffer()))["FAACIFP18"]);

const dep=selectDepartureByNextFix(text,{airport:"KDEN",procedure:"EMMYS8",nextFix:"ZIRKL"});
assert.equal(dep.status,"RESOLVED");
assert.deepEqual(dep.fixes,["EMMYS","ZIRKL"]);

const arr=selectArrivalByEntryFix(text,{airport:"KPHL",procedure:"BOJID4",entryFix:"JST"});
assert.equal(arr.status,"PARTIAL_AMBIGUOUS_RUNWAY");
assert.deepEqual(arr.fixes,["JST","MIROY","COFAX","LOMON","HAR","LRP","TRAGG","BUNTS"]);
assert.ok(arr.ambiguous_runway_branches.length>=2);
assert.ok(arr.ambiguous_runway_branches.some(x=>x.fixes.includes("BOJID")));
assert.ok(arr.ambiguous_runway_branches.some(x=>x.fixes.includes("KYILL")));

console.log(JSON.stringify({ok:true,departure:dep,arrival:arr},null,2));
