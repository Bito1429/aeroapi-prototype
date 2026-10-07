import assert from "node:assert/strict";
import{denseTimeline,corridorPolygon,etagFor}from"../api/package-core.js";

const route=[
 {latitude:40.6413,longitude:-73.7781},
 {latitude:39.0,longitude:-90.0},
 {latitude:33.9416,longitude:-118.4085}
];

const tl=denseTimeline(route,{startIso:"2026-10-07T12:00:00Z",durationSeconds:5*3600,maxMinutes:2,maxKm:25});
assert.ok(tl.length>100,"timeline should be dense");
for(let i=1;i<tl.length;i++){
 const dt=(new Date(tl[i].timestamp)-new Date(tl[i-1].timestamp))/60000;
 assert.ok(dt<=2.01,"timeline gap must be <=2 minutes");
}
const poly=corridorPolygon(route,6);
assert.equal(poly.type,"Polygon");
assert.ok(poly.coordinates[0].length>=7);
assert.deepEqual(poly.coordinates[0][0],poly.coordinates[0].at(-1),"polygon ring must close");

const a={status:"READY",generated_at:"2026-10-07T12:00:00Z",route:{hash:"abc"}};
const b={status:"READY",generated_at:"2026-10-07T12:01:00Z",route:{hash:"abc"}};
const c={status:"READY",generated_at:"2026-10-07T12:01:00Z",route:{hash:"def"}};
assert.equal(etagFor(a),etagFor(b),"generated_at must not invalidate ETag");
assert.notEqual(etagFor(a),etagFor(c),"content change must invalidate ETag");

console.log(JSON.stringify({ok:true,timeline_points:tl.length,corridor_vertices:poly.coordinates[0].length,etag:etagFor(a)}));
