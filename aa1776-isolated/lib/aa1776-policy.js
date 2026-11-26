// Pure safety policy for the isolated, test-only AA1776 Plan B.
// No provider credentials, no persistence and no calls in this module.
export const AA1776_DATES=Object.freeze(["2026-11-23","2026-11-24","2026-11-25","2026-11-26"]);
export const MAX_DAILY_RESERVED_MILLS=2000;
export const MAX_DAILY_PROVIDER_REQUESTS=30; // independent atomic request cap
export const MIN_RETRY_INTERVAL_MS=55*60000; // pre-19:00 UTC
export const EVENING_RETRY_INTERVAL_MS=13*60000; // 15-minute cron cadence; tolerate provider/cron jitter
// Published rates are $0.005 per flight result set and $0.010 per route.
// Reserve twice the published amount as a conservative allowance.
export const LOOKUP_RESERVATION_MILLS=10;
export const ROUTE_RESERVATION_MILLS=20;
const TWO_HOURS=120*60000;
const MONDAY_START="2026-11-23T11:00:00Z";
const MONDAY_END="2026-11-23T20:15:00Z";
// Tue-Thu: one pre-route-filed paid opportunity at 16:00 UTC,
// then date-specific evening slots (Thu starts at 18:30 UTC).
// Narrow post-minute grace allows normal Vercel cron scheduling jitter.
const EARLY_START="T16:00:00Z", EARLY_END="T16:10:00Z";
const EVENING_START="T19:00:00Z";
const EVENING_ENDS={"2026-11-24":"T21:18:00Z","2026-11-25":"T23:48:00Z","2026-11-26":"T21:33:00Z"};
// Pure retry gate. Every no-call outcome is checkable with zero provider access.
export function paidCheckDecision({state,lastCheckedAt,now,requestCount=0,refresh=false}={}){
 if(state==="CANCELLED"||(!refresh&&["READY","DEPARTED"].includes(state)))return"TERMINAL_STATE";
 const t=Date.parse(lastCheckedAt||""),n=Date.parse(now||"");
 const evening=Number.isFinite(n)&&(new Date(n).getUTCHours()>=19||(new Date(n).toISOString().slice(0,10)==="2026-11-26"&&new Date(n).getUTCHours()===18&&new Date(n).getUTCMinutes()>=30));
 const gap=evening?EVENING_RETRY_INTERVAL_MS:MIN_RETRY_INTERVAL_MS;
 if(Number(requestCount)>=MAX_DAILY_PROVIDER_REQUESTS)return"DAILY_REQUEST_CAP_REACHED";
 // A pre-evening check is a single paid attempt, even if it only fetched one endpoint.
 if(!evening&&Number(requestCount)>0)return"EARLY_CHECK_ALREADY_USED";
 if(Number.isFinite(t)&&Number.isFinite(n)&&n-t<gap)return"RETRY_COOLDOWN";
 return"CHECK_ROUTE";
}
export function isTargetDate(date){return AA1776_DATES.includes(date);}
export function inCollectionWindow(date,at){
 const t=Date.parse(at);
 if(!Number.isFinite(t))return false;
 if(date==="2026-11-23")return t>=Date.parse(MONDAY_START)&&t<=Date.parse(MONDAY_END);
 if(["2026-11-24","2026-11-25","2026-11-26"].includes(date)){
  const early=t>=Date.parse(date+EARLY_START)&&t<Date.parse(date+EARLY_END);
  const evening=t>=Date.parse(date+(date==="2026-11-26"?"T18:30:00Z":EVENING_START))&&t<Date.parse(date+EVENING_ENDS[date]);
  if(evening&&date!=="2026-11-24"){
   const minute=new Date(t).getUTCHours()*60+new Date(t).getUTCMinutes();
   const slots=date==="2026-11-26"?Array.from({length:13},(_,i)=>1110+i*15):[1140,1200,...Array.from({length:11},(_,i)=>1275+i*15)];
   return slots.some(slot=>minute>=slot&&minute<slot+3);
  }
  return early||evening;
 }
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
 if(["2026-11-25","2026-11-26"].includes(date)&&Math.abs(Date.parse(f.scheduled_out)-Date.parse(date+(date==="2026-11-25"?"T23:40:00Z":"T21:25:00Z")))>TWO_HOURS)
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

// Refresh policy is limited to the 26 November isolated run. Gate-out closes sales; takeoff freezes the route.
export function refreshDecision(f,now){
 const n=Date.parse(now),off=Date.parse(f?.estimated_off||"");
 if(f?.cancelled||/cancel/i.test(String(f?.status||"")))return "CANCELLED";
 const actual=Date.parse(f?.actual_off||"");
 if((Number.isFinite(actual)&&Number.isFinite(n)&&actual<=n)||/en.?route|airborne|arriv|landed/i.test(String(f?.status||"")))return "FROZEN";
 if(!Number.isFinite(n)||!Number.isFinite(off))return "REJECTED";
 return "CHECK_ROUTE";
}
