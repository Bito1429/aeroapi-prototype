// Pure safety policy for the isolated, test-only AA1776 Plan B.
// No provider credentials, no persistence and no calls in this module.
export const AA1776_DATES=Object.freeze(["2026-11-24","2026-11-26"]);
export const MAX_DAILY_RESERVED_MILLS=2000; // $2.000
// Published rates are $0.005 per flight result set and $0.010 per route.
// Reserve twice the published amount as a conservative allowance.
export const LOOKUP_RESERVATION_MILLS=10;
export const ROUTE_RESERVATION_MILLS=20;
const TWO_HOURS=120*60000;
const TUESDAY_START="2026-11-24T14:00:00Z";
const TUESDAY_END="2026-11-24T20:15:00Z";
const THURSDAY_START="2026-11-26T15:00:00Z";
const THURSDAY_END="2026-11-26T19:30:00Z";
export function isTargetDate(date){return AA1776_DATES.includes(date);}
export function inCollectionWindow(date,at){
 const t=Date.parse(at);
 if(!Number.isFinite(t))return false;
 if(date==="2026-11-24")return t>=Date.parse(TUESDAY_START)&&t<=Date.parse(TUESDAY_END);
 if(date==="2026-11-26")return t>=Date.parse(THURSDAY_START)&&t<=Date.parse(THURSDAY_END);
 return false;
}
function airportCode(a){return String(a?.code_icao||a?.code||a||"").toUpperCase();}
export function selectAA1776(flights,date){
 if(!isTargetDate(date))return{ok:false,error:"DATE_NOT_ALLOWED"};
 const eligible=(Array.isArray(flights)?flights:[]).filter(f=>{
  const ident=String(f?.ident_icao||f?.ident||"").toUpperCase();
  const out=Date.parse(f?.scheduled_out||"");
  return /^(?:AAL|AA)1776$/.test(ident)&&airportCode(f.origin)==="KPHL"&&airportCode(f.destination)==="KBOS"&&
   Number.isFinite(out)&&new Date(out).toISOString().slice(0,10)===date;
 });
 if(eligible.length!==1)return{ok:false,error:eligible.length?"AMBIGUOUS_FLIGHT":"FLIGHT_NOT_FOUND"};
 const f=eligible[0];
 if(date==="2026-11-26"&&Math.abs(Date.parse(f.scheduled_out)-Date.parse("2026-11-26T21:25:00Z"))>TWO_HOURS)
  return{ok:false,error:"UNEXPECTED_DEPARTURE_TIME"};
 if(!f.fa_flight_id)return{ok:false,error:"MISSING_PROVIDER_FLIGHT_ID"};
 return{ok:true,flight:f};
}
export function saleDecision(f,now){
 const status=String(f?.status||"");
 if(/cancel/i.test(status))return"CANCELLED";
 if(f?.actual_out||f?.actual_off||/depart|en.?route|airborne|arriv|landed/i.test(status))return"DEPARTED";
 const scheduled=Date.parse(f?.scheduled_out||""),nowMs=Date.parse(now||"");
 if(!Number.isFinite(scheduled)||!Number.isFinite(nowMs))return"PENDING_SOURCE";
 const estimated=Date.parse(f?.estimated_out||"");
 if(nowMs>=scheduled&&!(Number.isFinite(estimated)&&estimated>nowMs&&estimated>=scheduled))
  return"DEPARTED";
 return"CHECK_ROUTE";
}
export function routeValid(protocol){
 return !!(protocol?.baseline_valid&&protocol?.canonical_route&&protocol?.computed_km>0&&
 Array.isArray(protocol?.fixes)&&protocol.fixes.length>=2&&protocol.fixes.every(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)));
}
