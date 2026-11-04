import test from "node:test";
import assert from "node:assert/strict";
import {modelFiledTimeline} from "../api/filed-timeline.js";
import {toChesterV1} from "../api/chester-schema.js";
const pts=[{name:"KJFK",latitude:40.63993,longitude:-73.77869},{name:"KLAX",latitude:33.9425,longitude:-118.40805}];
test("filed model is finite, monotonic and conserves filed distance/time",()=>{
 const t=modelFiledTimeline(pts,{durationSeconds:318*60,distanceKm:4072.154});
 assert.ok(t.length>150);
 assert.equal(t[0].phase,"takeoff");assert.equal(t.at(-1).phase,"landing");
 assert.equal(t.at(-1).t_min,318);assert.ok(Math.abs(t.at(-1).dist_km-4072.154)<.01);
 for(let i=1;i<t.length;i++){assert.ok(t[i].dist_km>t[i-1].dist_km);assert.ok(t[i].t_min>t[i-1].t_min);assert.ok(t[i].gs_kmh>0);}
});
test("filed model fails closed on missing duration",()=>assert.deepEqual(modelFiledTimeline(pts,{durationSeconds:null,distanceKm:4072}),[]));
test("Chester adapter rejects missing captured airline instead of guessing",()=>{
 const d={status:"READY",flight:{id:"test",estimated_off:"2026-11-04T12:00:00Z"},route:{fixes:pts,distance_km:4072},eta:{duration_seconds:19080}};
 assert.throws(()=>toChesterV1(d,{airports:{origin:{},destination:{}},aircraftType:"A321",expiresAt:"2026-11-05T00:00:00Z"}),/CHESTER_REQUIRED_FIELD:airline/);
});
