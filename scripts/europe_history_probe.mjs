#!/usr/bin/env node

// Europe historical-route feasibility capability probe.
// Read-only. No database writes. No production dependencies.
// Usage:
//   AEROAPI_KEY=... node scripts/europe_history_probe.mjs
//
// Purpose:
// 1) verify the active AeroAPI account can retrieve historical European operator flights;
// 2) inspect operator / codeshare fields returned by AeroAPI;
// 3) inspect pagination and result volume before the frozen 45-day sampling pull.

const BASE="https://aeroapi.flightaware.com/aeroapi";
const OPS=[
  {label:"Ryanair",icao:"RYR"},
  {label:"easyJet",icao:"EZY"},
  {label:"Jet2",icao:"EXS"},
  {label:"Wizz Air",icao:"WZZ"},
];

const START="2026-09-27T00:00:00Z";
const END="2026-09-28T23:59:59Z";

const key=process.env.AEROAPI_KEY;
if(!key){
  console.error("AEROAPI_KEY is not set.");
  process.exit(2);
}

async function aero(path,params={}){
  const u=new URL(BASE+path);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  const r=await fetch(u,{headers:{"x-apikey":key}});
  const text=await r.text();
  let body;
  try{ body=JSON.parse(text); }catch{ body={raw:text}; }
  if(!r.ok){
    const e=new Error(`AeroAPI HTTP ${r.status}`);
    e.status=r.status;
    e.body=body;
    throw e;
  }
  return body;
}

function code(a){
  return a?.code_icao||a?.code||a||null;
}

function slim(f){
  return {
    fa_flight_id:f.fa_flight_id??null,
    ident:f.ident??null,
    ident_icao:f.ident_icao??null,
    operator:f.operator??null,
    operator_icao:f.operator_icao??null,
    codeshares:f.codeshares??null,
    origin:code(f.origin),
    destination:code(f.destination),
    scheduled_out:f.scheduled_out??null,
    scheduled_in:f.scheduled_in??null,
    actual_out:f.actual_out??null,
    actual_in:f.actual_in??null,
    status:f.status??null,
  };
}

const result={
  probe:"Europe historical-route feasibility capability probe",
  window:{start:START,end:END},
  generated_at:new Date().toISOString(),
  operators:{}
};

for(const op of OPS){
  try{
    const body=await aero(`/history/operators/${op.icao}/flights`,{
      start:START,
      end:END,
      max_pages:1
    });
    const flights=body.flights||body.arrivals||body.departures||[];
    result.operators[op.icao]={
      label:op.label,
      ok:true,
      returned:flights.length,
      top_level_keys:Object.keys(body),
      links:body.links??null,
      sample:flights.slice(0,3).map(slim)
    };
  }catch(e){
    result.operators[op.icao]={
      label:op.label,
      ok:false,
      status:e.status??null,
      error:e.message,
      detail:e.body??null
    };
  }
}

console.log(JSON.stringify(result,null,2));

const failures=Object.values(result.operators).filter(x=>!x.ok);
if(failures.length) process.exitCode=1;
