// Pure safety policy for the isolated, test-only AA1776 Plan B.
// No provider credentials, no persistence and no calls in this module.
export const AA1776_DATES=Object.freeze(["2026-11-23","2026-11-24","2026-11-25","2026-11-26"]);
export const MAX_DAILY_RESERVED_MILLS=2000;
export const MAX_DAILY_PROVIDER_REQUESTS=16; // independent atomic request cap
export const MIN_RETRY_INTERVAL_MS=55*60000; // pre-19:00 UTC
export const EVENING_RETRY_INTERVAL_MS=13*60000; // 15-minute cron cadence; tolerate provider/cron jitter
// Published rates are $0.005 per flight result set and $0.010 per route.
// Reserve twice the published amount as a conservative allowance.
export const LOOKUP_RESERVATION_MILLS=10;
export const ROUTE_RESERVATION_MILLS=20;
const TWO_HOURS=120*60000;
const MONDAY_START="2026-11-23T11:00:00Z";
const MONDAY_END="2026-11-23T20:15:00Z";
const TUESDAY_START="2026-11-24T14:00:00Z";
const TUESDAY_END="2026-11-24T21:15:00Z";
const WEDNESDAY_START="2026-11-25T14:00:00Z";
const WEDNESDAY_END="2026-11-25T21:15:00Z";
const THURSDAY_START="2026-11-26T15:00:00Z";
const THURSDAY_END="2026-11-26T21:15:00Z";
// Pure retry gate. Every no-call outcome is checkable with zero provider access.
export function paidCheckDecision({state,lastCheckedAt,now,requestCount=0}={}){
 if(["READY","DEPARTED","CANCELLED"].includes(state))return"TERMINAL_STATE";
 const t=Date.parse(lastCheckedAt||""),n=Date.parse(now||"");
 const evening=Number.isFinite(n)&&new Date(n).getUTCHours()>=19;
 const gap=evening?EVENING_RETRY_INTERVAL_MS:MIN_RETRY_INTERVAL_MS;
 if(Number.isFinite(t)&&Number.isFinite(n)&&n-t<gap)return"RETRY_COOLDOWN";
 if(Number(requestCount)>=MAX_DAILY_PROVIDER_REQUESTS)return"DAILY_REQUEST_CAP_REACHED";
 return"CHECK_ROUTE";
}
export function isTargetDate(date){return AA1776_DATES.includes(date);}
export function inCollectionWindow(date,at){
 const t=Date.parse(at);
 if(!Number.isFinite(t))return false;
 if(date==="2026-11-23")return t>=Date.parse(MONDAY_START)&&t<=Date.parse(MONDAY_END);
 if(date==="2026-11-24")return t>=Date.parse(TUESDAY_START)&&t<=Date.parse(TUESDAY_END);
 if(date==="2026-11-25")return t>=Date.parse(WEDNESDAY_START)&&t<=Date.parse(WEDNESDAY_END);
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
 if(["2026-11-25","2026-11-26"].includes(date)&&Math.abs(Date.parse(f.scheduled_out)-Date.parse(date+"T21:25:00Z"))>TWO_HOURS)
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

// Derived package and relay use the same expiry: Thursday arrival + 12h, other dates midnight.
export function aa1776PackageExpiresAt(flightDate,scheduledArrival){
 const arrivalMs=Date.parse(scheduledArrival||"");
 if(!Number.isFinite(arrivalMs))throw Error("SCHEDULED_ARRIVAL_REQUIRED");
 if(flightDate==="2026-11-26")return new Date(arrivalMs+12*60*60*1000).toISOString();
 return new Date(Math.floor(arrivalMs/86400000)*86400000+86400000).toISOString();
}
