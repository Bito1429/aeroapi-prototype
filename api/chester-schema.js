import buffer from "@turf/buffer";
// Chester schema v1 adapter. Fail closed when source data is incomplete.
// Input is the internal READY draft returned by buildDraftPackage.
export function toChesterV1(draft,{airports,airline,aircraftType,expiresAt,pois=[]}={}){
 const fail=(field)=>{throw new Error("CHESTER_REQUIRED_FIELD:"+field)};
 if(draft?.status!=="READY")fail("status");
 const f=draft.flight||{},r=draft.route||{},e=draft.eta||{};
 const duration=e.duration_seconds;
 if(!Number.isFinite(duration)||duration<=0)fail("eta.duration_seconds");
 if(!f.estimated_off||!Number.isFinite(Date.parse(f.estimated_off)))fail("flight.estimated_off");
 if(!Array.isArray(r.fixes)||r.fixes.length<2)fail("route.fixes");
 if(!Number.isFinite(r.distance_km)||r.distance_km<=0)fail("route.distance_km");
 if(!airports?.origin||!airports?.destination)fail("airports");
 if(!airline?.code||!airline?.name)fail("airline");
 if(!aircraftType)fail("aircraft_type");
 if(!expiresAt||!Number.isFinite(Date.parse(expiresAt)))fail("expires_at");
 // Chester v1.0 refuses packages already expired at generation; do not publish stale captures.
 if(draft.generated_at&&Date.parse(expiresAt)<=Date.parse(draft.generated_at))fail("expires_at_stale");
 const pts=r.fixes.map(p=>({name:p.name||null,lat:p.latitude,lon:p.longitude}));
 if(pts.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)))fail("route.coordinates");
 const timeline=r.timeline||[];
 if(timeline.length<2||timeline.some(p=>!Number.isFinite(p.fraction)||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)))fail("route.timeline");
 const corridor=r.corridor||draft.corridor||{};
 // Generate a true 6 km buffer from the exact route.line published below.
 const generatedAt=draft.generated_at;
 if(!generatedAt||!Number.isFinite(Date.parse(generatedAt)))fail("generated_at");
 const airborneMinutes=duration/60;
 const routeLine=pts.map(p=>[p.lat,p.lon]);
 const buffered=buffer({type:"Feature",properties:{},geometry:{type:"LineString",coordinates:routeLine.map(([lat,lon])=>[lon,lat])}},6,{units:"kilometers",steps:16});
 const ring=buffered?.geometry?.coordinates?.[0];
 if(buffered?.geometry?.type!=="Polygon"||!ring||ring.length<4)fail("corridor.buffer");
 const airport=a=>({iata:a.code_iata,icao:a.code_icao,name:a.name,lat:a.latitude,lon:a.longitude,tz:a.timezone});
 for(const a of [airports.origin,airports.destination])if(!a?.code_iata||!a?.code_icao||!a?.name||!Number.isFinite(a?.latitude)||!Number.isFinite(a?.longitude)||!a?.timezone)fail("airport.metadata");
 // Never invent ground speeds or climb/descent phases to satisfy the checker.
 // A calibrated timeline with measured or explicitly modelled speeds and phases is required.
 if(timeline.some(p=>!Number.isFinite(p.gs_kmh)||!["takeoff","climb","cruise","descent","landing"].includes(p.phase)))fail("timeline.phase_or_groundspeed");
 const out={
  schema:"aevpath.package.v1",schema_minor:0,
  package_version:"system-"+generatedAt.replace(/[^0-9]/g,""),
  flight_id:f.id,market:"US",generated_at:generatedAt,expires_at:expiresAt,
  frozen_after:"takeoff",
  attribution:"Contains AeroAPI data (c) FlightAware LLC 2026 · (c) OpenMapTiles (c) OpenStreetMap contributors",
  flight:{
   ident:f.ident,ident_icao:f.ident_icao||f.ident,
   airline,
   origin:airport(airports.origin),destination:airport(airports.destination),
   scheduled_departure:f.scheduled_out,
   scheduled_arrival:f.scheduled_arrival||null,
   aircraft_type:aircraftType,
   estimated_out:f.estimated_out||null
  },
  route:{
   total_distance_km:r.distance_km,
   line:routeLine,
   waypoints:pts.map(p=>({name:p.name,lat:p.lat,lon:p.lon,type:"Waypoint"})),
   sanity:{status:r.resolver_sanity?.ok?"OK":"FAIL",reason:r.resolver_sanity?.ok?null:r.resolver_sanity?.reason||"UNKNOWN"}
  },
  corridor:{
   polygon:ring.map(([lon,lat])=>[lat,lon]),
   display_half_width_km:6,
   statistical:{half_width_km:18,coverage:0.8}
  },
  timeline:timeline.map((p,i)=>({
   t_min:p.t_min,
   lat:p.latitude,lon:p.longitude,
   dist_km:p.dist_km,
   phase:p.phase,
   gs_kmh:p.gs_kmh
  })),
  pois,
  eta:{
   expected_airborne_min:airborneMinutes,
   airborne_window_min:{earliest:airborneMinutes-9,latest:airborneMinutes+9,coverage:0.8},
   departure:{estimated_off:f.estimated_off,window_min:{earliest:-17,latest:17,coverage:0.8}},
   display_label:"Landing window"
  },
  ...(draft.check_again_after?{check_again_after:draft.check_again_after}:{})
 };
 if(!out.flight.scheduled_departure)fail("scheduled_departure");
 if(!f.estimated_out&&!f.actual_off)fail("estimated_out");
 if(!f.ident_icao)fail("ident_icao");
 return out;
}
