import assert from "node:assert/strict";
import {canonicalize} from "../api/lib.js";

function fix(name,latitude,longitude,type="WAYPOINT"){return{name,latitude,longitude,type};}

{
  const p=canonicalize([
    fix("KIAH",29.9844,-95.3414,"Origin Airport"),
    fix("MUSYL",28.1704,-94.1292),
    fix("KDFW",32.8972,-97.0377,"Destination Airport")
  ]);
  assert.equal(p.resolver_rejections.length,0);
}

{
  const p=canonicalize([
    fix("MMMY",25.7785,-100.1069,"Origin Airport"),
    fix("UT11",40.6603,-111.8894,"ARPT"),
    fix("MMUN",21.0365,-86.8771,"Destination Airport")
  ]);
  assert.equal(p.baseline_valid,false);
  assert.equal(p.resolver_rejections[0].name,"UT11");
  assert.equal(p.resolver_rejections[0].reason,"AIRWAY_TOKEN_COORDINATE_COLLISION");
}

{
  const p=canonicalize([
    fix("MMMX",19.4363,-99.0721,"Origin Airport"),
    fix("VER",61.1743,-149.9985,"VOR"),
    fix("MMUN",21.0365,-86.8771,"Destination Airport")
  ]);
  assert.equal(p.baseline_valid,false);
  assert.equal(p.resolver_rejections[0].name,"VER");
  assert.equal(p.resolver_rejections[0].reason,"OFF_CORRIDOR_DETOUR");
}

{
  const p=canonicalize([
    fix("CYYZ",43.6772,-79.6306,"Origin Airport"),
    fix("KP15G",47.5,-94,"NRS-WAYPOINT"),
    fix("CYVR",49.1939,-123.1844,"Destination Airport")
  ]);
  assert.equal(p.resolver_rejections.length,0);
}

{
  const p=canonicalize([
    fix("MDSD",18.4297,-69.6689,"Origin Airport"),
    {name:"L455",latitude:null,longitude:null,type:"UNKNOWN"},
    fix("KJFK",40.6399,-73.7787,"Destination Airport")
  ]);
  assert.equal(p.baseline_valid,false);
  assert.deepEqual(p.missing_coordinate_fixes,["L455"]);
}

console.log("resolver regression fixtures: PASS");
