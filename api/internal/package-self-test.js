import{json}from"../lib.js";
import{denseTimeline,corridorPolygon,etagFor}from"../package-core.js";
import{ETA_CALIBRATION,etaPackage}from"../eta-calibration.js";
import{CORRIDOR_CALIBRATION}from"../corridor-calibration.js";

export default async function handler(req,res){
 try{
  const route=[
   {latitude:40.6413,longitude:-73.7781},
   {latitude:39.0,longitude:-90.0},
   {latitude:33.9416,longitude:-118.4085}
  ];
  const tl=denseTimeline(route,{startIso:"2026-10-07T12:00:00Z",durationSeconds:18000,maxMinutes:2,maxKm:25});
  if(tl.length<=100)throw new Error("timeline not dense enough");
  const poly=corridorPolygon(route,CORRIDOR_CALIBRATION.confidence_half_width_km);
  if(poly?.type!=="Polygon")throw new Error("corridor polygon failed");
  const a={status:"READY",generated_at:"2026-10-07T12:00:00Z",route:{hash:"abc"}};
  const b={status:"READY",generated_at:"2026-10-07T12:01:00Z",route:{hash:"abc"}};
  if(etagFor(a)!==etagFor(b))throw new Error("generated_at invalidates ETag");
  const eta=etaPackage({estimatedOff:"2026-10-07T12:00:00Z",filedEteSeconds:7200});
  if(eta.predeparture.landing_window?.early!=="2026-10-07T13:43:00.000Z")throw new Error("landing window failed");
  return json(res,200,{ok:true,timeline_points:tl.length,corridor_half_width_km:CORRIDOR_CALIBRATION.confidence_half_width_km,eta_pre_half_width_min:ETA_CALIBRATION.predeparture.half_width_minutes,eta_airborne_half_width_min:ETA_CALIBRATION.airborne.half_width_minutes,semantics:eta.semantics});
 }catch(e){return json(res,500,{ok:false,error:e.message});}
}
