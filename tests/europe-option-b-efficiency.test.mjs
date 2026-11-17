import test from "node:test";
import assert from "node:assert/strict";
import {MAX_PROVIDER_REQUESTS,OPERATING_REQUESTS,COLLECT_REQUESTS,cooldownMinutes,chooseDiscoveryRoutes} from "../api/europe-option-b-efficiency.js";

test("300 hard cap with 20-request operating reserve",()=>{
 assert.equal(MAX_PROVIDER_REQUESTS,300);
 assert.equal(OPERATING_REQUESTS,280);
 assert.equal(COLLECT_REQUESTS,96);
 assert.ok(OPERATING_REQUESTS < MAX_PROVIDER_REQUESTS);
});
test("cooldowns prevent premature recheck and back off 503",()=>{
 assert.equal(cooldownMinutes("score"),50);
 assert.equal(cooldownMinutes("collect"),75);
 assert.equal(cooldownMinutes("score",503),90);
 assert.equal(cooldownMinutes("collect",503),90);
});
test("discovery uses at most two distinct routes per quarter hour",()=>{
 const seed=Array.from({length:29},(_,i)=>"seed-"+i),unseed=Array.from({length:21},(_,i)=>"new-"+i);
 for(let slot=0;slot<192;slot++){
  const r=chooseDiscoveryRoutes(seed,unseed,slot);
  assert.ok(r.length<=2);
  assert.equal(new Set(r).size,r.length);
  if(slot%8===0)assert.ok(r.some(x=>x.startsWith("new-")));
 }
});
test("seeded and unseeded route coverage rotates over two days",()=>{
 const seed=Array.from({length:29},(_,i)=>"seed-"+i),unseed=Array.from({length:21},(_,i)=>"new-"+i);
 const seen=new Set();
 for(let slot=0;slot<192;slot++)for(const route of chooseDiscoveryRoutes(seed,unseed,slot))seen.add(route);
 for(const r of [...seed,...unseed])assert.ok(seen.has(r),r);
});
test("no discovered route is invented when all pools are empty",()=>{
 assert.deepEqual(chooseDiscoveryRoutes([],[],5),[]);
});
