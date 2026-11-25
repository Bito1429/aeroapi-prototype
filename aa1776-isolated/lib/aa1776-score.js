// AA1776 only: reuse production Method A unchanged (US commit 44fc925).
import{methodA}from"./method-a.js";
export const SCORE_METHOD_VERSION="US_METHOD_A_44fc925";
export const SCORE_RESERVATION_MILLS=24; // twice the published $0.012 track result-set price
export function scoreTrack(pkg,payload,actualOff,actualOn){
 const off=Date.parse(actualOff),on=Date.parse(actualOn),capture=Date.parse(pkg?.generated_at);
 const duration=Number(pkg?.eta?.expected_airborne_min),estimatedOff=Date.parse(pkg?.eta?.departure?.estimated_off);
 if(!Number.isFinite(off)||!Number.isFinite(on)||on<=off||!Number.isFinite(capture)||capture>=off||!Number.isFinite(estimatedOff)||!Number.isFinite(duration)||duration<=0)
  throw Error("INVALID_FROZEN_TIMING");
 if(pkg?.schema!=="aevpath.package.v1"||pkg?.market!=="US"||pkg?.flight?.origin?.icao!=="KPHL"||pkg?.flight?.destination?.icao!=="KBOS"||! /^(?:AA|AAL)1776$/.test(String(pkg?.flight?.ident_icao||pkg?.flight?.ident||"").toUpperCase()))
  throw Error("INVALID_FROZEN_PACKAGE");
 const line=pkg?.route?.line;
 if(!Array.isArray(line)||line.length<2||!line.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))throw Error("INVALID_BASELINE");
 const baseline=line.map(p=>({latitude:p[0],longitude:p[1]}));
 const p=payload?.positions||payload?.track||[];
 if(!Array.isArray(p)||p.length<2)throw Error("TRACK_INCOMPLETE");
 if(payload?.fa_flight_id&&payload.fa_flight_id!==pkg.flight_id)throw Error("TRACK_ID_MISMATCH");
 // Same termination gate used by the US worker: final provider track timestamp within ten minutes of touchdown.
 const last=Date.parse(p.at(-1)?.timestamp);
 if(!Number.isFinite(last)||Math.abs(last-on)>10*60000)throw Error("TRACK_NOT_TERMINATED");
 const actual=p.filter(x=>Number.isFinite(x?.latitude)&&Number.isFinite(x?.longitude));
 if(actual.length<2)throw Error("TRACK_INCOMPLETE");
 const rows=methodA(baseline,actual);
 if(rows.length!==5||rows.some(x=>![x.total,x.xtd,x.atd].every(Number.isFinite)))throw Error("SCORE_INVALID");
 const mean=k=>rows.reduce((a,x)=>a+x[k],0)/rows.length;
 const round=x=>Math.round(x*1000)/1000;
 const early=Number(pkg.eta.airborne_window_min?.earliest),late=Number(pkg.eta.airborne_window_min?.latest);
 if(!Number.isFinite(early)||!Number.isFinite(late)||early>duration||late<duration)throw Error("INVALID_FROZEN_WINDOW");
 const actualMinutes=(on-off)/60000;
 const predictedOn=estimatedOff+duration*60000,anchoredOn=off+duration*60000;
 const within=(t,a,b)=>t>=a&&t<=b;
 return{
  method:SCORE_METHOD_VERSION,package_version:pkg.package_version,
  checkpoints:rows,
  mean_total_km:round(mean("total")),mean_xtd_km:round(mean("xtd")),mean_atd_km:round(mean("atd")),
  timing:{
   expected_airborne_min:duration,actual_airborne_min:round(actualMinutes),
   airborne_error_min:round(actualMinutes-duration),
   original_predicted_on:new Date(predictedOn).toISOString(),
   original_error_min:round((on-predictedOn)/60000),
   original_window_contains_touchdown:within(on,estimatedOff+early*60000,estimatedOff+late*60000),
   takeoff_anchored_predicted_on:new Date(anchoredOn).toISOString(),
   takeoff_anchored_error_min:round((on-anchoredOn)/60000),
   takeoff_anchored_window_contains_touchdown:within(on,off+early*60000,off+late*60000)
  }
 };
}
