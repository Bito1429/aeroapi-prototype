import test from "node:test";
import assert from "node:assert/strict";
import {saleState,nextCheckAfter} from "../api/chester-sale-state.js";

const now=new Date("2026-11-16T20:30:00.000Z");
const ready={origin:"KPHL",destination:"KBOS",status:"Scheduled",scheduled_out:"2026-11-16T22:00:00Z",estimated_out:"2026-11-16T22:00:00Z",last_capture_at:"2026-11-16T20:20:00Z",has_route:true};

test("all five Chester sale states",()=>{
  assert.equal(saleState(ready,now),"SELLABLE");
  assert.equal(saleState({...ready,status:"Cancelled"},now),"CANCELLED");
  assert.equal(saleState({...ready,final_actual_out:"2026-11-16T20:00:00Z"},now),"DEPARTED");
  assert.equal(saleState({...ready,origin:"EGLL"},now),"UNSUPPORTED_MARKET");
  assert.equal(saleState({...ready,has_route:false},now),"PENDING_ROUTE");
});
test("ground-stop delayed and stale safety",()=>{
  assert.equal(saleState({...ready,scheduled_out:"2026-11-16T20:15:00Z",estimated_out:"2026-11-16T22:00:00Z"},now),"SELLABLE");
  assert.equal(saleState({...ready,estimated_out:"2026-11-16T20:15:00Z"},now),"PENDING_ROUTE");
  assert.equal(saleState({...ready,last_capture_at:"2026-11-16T19:45:00Z"},now),"PENDING_ROUTE");
  assert.equal(saleState({...ready,last_capture_at:null},now),"PENDING_ROUTE");
});
test("15 minute UTC retry time",()=>assert.equal(nextCheckAfter(now),"2026-11-16T20:45:00.000Z"));
