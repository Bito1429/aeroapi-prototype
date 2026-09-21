import crypto from "node:crypto";
const BASE="https://aeroapi.flightaware.com/aeroapi";
export function json(res,status,body){res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.end(JSON.stringify(body));}
export async function aero(path,params={}){const key=process.env.AEROAPI_KEY;if(!key)throw new Error("AEROAPI_KEY is not configured");const u=new URL(BASE+path);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v));const r=await fetch(u,{headers:{"x-apikey":key}}),t=await r.text();let b;try{b=JSON.parse(t)}catch{b={raw:t}};if(!r.ok){const e=new Error("AeroAPI "+r.status);e.status=r.status;e.body=b;throw e;}return b;}
export function havKm(a,b){const R=6371.0088,rad=Math.PI/180,p1=a.latitude*rad,p2=b.latitude*rad,dp=(b.latitude-a.latitude)*rad,dl=(b.longitude-a.longitude)*rad,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
export function polyKm(p){let d=0;for(let i=1;i<p.length;i++)d+=havKm(p[i-1],p[i]);return d;}
const AIRWAY_RE=/^(?:[JQVTLRYAMBGNPW]\\d{1,3}|U[JQVTLRYAMBGNPW]\\d{1,3}|RTE\\d{1,3})$/i;
function finiteFix(f){return Number.isFinite(f?.latitude)&&Number.isFinite(f?.longitude);}
function cloneFix(f){return{...f};}
function corridorReject(f,origin,destination){
  if(!finiteFix(f)||!finiteFix(origin)||!finiteFix(destination))return null;
  const direct=havKm(origin,destination);
  if(direct<100)return null;
  const via=havKm(origin,f)+havKm(f,destination);
  const excess=via-direct;
  const ratio=via/direct;
  if((direct<500&&ratio>2.5&&excess>400)||(direct>=500&&ratio>1.8&&excess>500)){
    return{reason:"OFF_CORRIDOR_DETOUR",direct_km:+direct.toFixed(1),via_km:+via.toFixed(1),excess_km:+excess.toFixed(1),ratio:+ratio.toFixed(2)};
  }
  return null;
}
export function validateResolvedFixes(fixes=[]){
  const out=fixes.map(cloneFix),rejected=[];
  const origin=out.find(f=>finiteFix(f))||null;
  const destination=[...out].reverse().find(f=>finiteFix(f))||null;
  for(let i=1;i<out.length-1;i++){
    const f=out[i];
    if(!finiteFix(f))continue;
    let verdict=null;
    if(AIRWAY_RE.test(String(f.name||""))){
      verdict={reason:"AIRWAY_TOKEN_COORDINATE_COLLISION"};
    }else{
      verdict=corridorReject(f,origin,destination);
    }
    if(verdict){
      rejected.push({name:f.name,original_type:f.type??null,original_latitude:f.latitude,original_longitude:f.longitude,...verdict});
      f.latitude=null;f.longitude=null;
      f.type="REJECTED";
      f.resolver_rejection=verdict.reason;
    }
  }
  return{fixes:out,rejected};
}
export function canonicalize(fixes=[]){
  const d=[];for(const f of fixes){if(!f?.name)continue;if(d.length&&d[d.length-1].name===f.name)continue;d.push(f);}
  const validated=validateResolvedFixes(d),safe=validated.fixes;
  const route=safe.map(f=>f.name).join("-"),hash=crypto.createHash("sha256").update(route).digest("hex").slice(0,8);
  const miss=safe.filter(f=>!finiteFix(f)).map(f=>f.name),pts=safe.filter(f=>finiteFix(f)),km=polyKm(pts);
  return{canonical_fix_count:safe.length,canonical_route:route,canonical_hash:hash,baseline_valid:miss.length===0&&validated.rejected.length===0,missing_coordinate_fixes:miss,resolver_rejections:validated.rejected,resolver_validation:{mode:"FAIL_CLOSED_V1",rejected_count:validated.rejected.length},computed_km:+km.toFixed(3),computed_nm:+(km/1.852).toFixed(3),fixes:safe};
}
export async function flightById(id){const b=await aero("/flights/"+encodeURIComponent(id),{ident_type:"fa_flight_id"}),f=(b.flights||[])[0];if(!f)throw Object.assign(new Error("Flight not found"),{status:404});return f;}
export function flightView(f){return{fa_flight_id:f.fa_flight_id,ident:f.ident,origin:f.origin?.code_icao||f.origin?.code||f.origin,destination:f.destination?.code_icao||f.destination?.code||f.destination,status:f.status,scheduled_out:f.scheduled_out,estimated_out:f.estimated_out,actual_out:f.actual_out,scheduled_off:f.scheduled_off,estimated_off:f.estimated_off,actual_off:f.actual_off,scheduled_on:f.scheduled_on,estimated_on:f.estimated_on,actual_on:f.actual_on,scheduled_in:f.scheduled_in,estimated_in:f.estimated_in,actual_in:f.actual_in,route:f.route,route_distance:f.route_distance,filed_ete:f.filed_ete,filed_altitude:f.filed_altitude,aircraft_type:f.aircraft_type,actual_runway_off:f.actual_runway_off??null,actual_runway_on:f.actual_runway_on??null};}
export async function captureFlight(id){const captured_at=new Date().toISOString();const[f,r]=await Promise.all([flightById(id),aero("/flights/"+encodeURIComponent(id)+"/route")]);return{captured_at,flight:flightView(f),protocol:canonicalize(r.fixes||[]),route_header_distance:r.route_distance??null};}
export async function postflight(id){const captured_at=new Date().toISOString();const[f,b]=await Promise.all([flightById(id),aero("/flights/"+encodeURIComponent(id)+"/track")]);const p=b.positions||b.track||[],km=polyKm(p);return{captured_at,flight:flightView(f),landed:!!f.actual_on,track:{count:p.length,first:p[0]?.timestamp||null,last:p.at(-1)?.timestamp||null,computed_km:+km.toFixed(3),computed_nm:+(km/1.852).toFixed(3),points:p}};}
export function addMin(iso,m){return new Date(new Date(iso).getTime()+m*60000).toISOString();}
export function isCancelled(status){return /cancel/i.test(String(status||""));}
export function trackLooksTerminated(pf,tolMin=10){if(!pf.flight.actual_on||pf.track.count<2||!pf.track.last)return false;return Math.abs(new Date(pf.flight.actual_on).getTime()-new Date(pf.track.last).getTime())<=tolMin*60000;}
export async function lookup(ident,date){const p={max_pages:1};if(date){const s=new Date(date+"T00:00:00Z");p.start=s.toISOString();p.end=new Date(s.getTime()+86400000).toISOString();}const b=await aero("/flights/"+encodeURIComponent(ident),p);return b.flights||[];}
