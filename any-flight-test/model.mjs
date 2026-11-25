// Isolated candidate model: reuse the campaign geometry/scorer, not copies.
import {canonicalize} from "../api/lib.js";
import {methodA} from "../api/score.js";
export {methodA as scoreRoute};
export const MODEL_VERSION="us-any-flight-candidate-20261125";
const MIN_SAMPLES=8; // provisional test threshold, not a production approval
const routeKey=(o,d)=>{if(!/^K[A-Z]{3}$/.test(o)||!/^K[A-Z]{3}$/.test(d)||o===d)throw new Error("INVALID_US_ROUTE");return o+"-"+d};
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
export function calibrateRoute({origin,destination,durationsSeconds}){
 const key=routeKey(origin,destination);
 if(!Array.isArray(durationsSeconds)||durationsSeconds.some(x=>!Number.isFinite(x)||x<=0))throw new Error("INVALID_HISTORY");
 const n=durationsSeconds.length;
 if(n<MIN_SAMPLES)return {key,n,state:"INSUFFICIENT_HISTORY"};
 const durationSeconds=Math.round(median(durationsSeconds));
 const errors=durationsSeconds.map((x,i)=>Math.abs(x-Math.round(median(durationsSeconds.filter((_,j)=>j!==i))))).sort((a,b)=>a-b);
 const windowSeconds=Math.max(540,Math.ceil(errors[Math.ceil(.8*n)-1]/60)*60);
 return {key,n,state:"CANDIDATE",durationSeconds,windowSeconds,looCoverage:errors.filter(e=>e<=windowSeconds).length/n,looMaeSeconds:errors.reduce((a,b)=>a+b,0)/n};
}
export function predictFlight({origin,destination,fixes,timing,takeoffUtc}){
 const key=routeKey(origin,destination);
 if(!Array.isArray(fixes)||fixes.length<2||fixes.some(f=>typeof f?.name!=="string"||!f.name||!Number.isFinite(f.latitude)||Math.abs(f.latitude)>90||!Number.isFinite(f.longitude)||Math.abs(f.longitude)>180))throw new Error("INVALID_ROUTE_FIXES");
 const route=canonicalize(fixes);
 if(!route.baseline_valid||route.canonical_fix_count<2||route.computed_km<=0)throw new Error("INVALID_ROUTE_FIXES");
 if(!timing||timing.key!==key||timing.state!=="CANDIDATE"||!Number.isInteger(timing.n)||timing.n<MIN_SAMPLES||!Number.isInteger(timing.durationSeconds)||timing.durationSeconds<=0||!Number.isInteger(timing.windowSeconds)||timing.windowSeconds<540||!Number.isFinite(timing.looCoverage)||timing.looCoverage<.8||timing.looCoverage>1)return {status:"TIMING_UNAVAILABLE",reason:"VALIDATED_GENERAL_FALLBACK_NOT_AVAILABLE",modelVersion:MODEL_VERSION,routeKey:key};
 if(timing.durationSeconds<=timing.windowSeconds)return {status:"TIMING_UNAVAILABLE",reason:"WINDOW_EXCEEDS_DURATION",modelVersion:MODEL_VERSION,routeKey:key};
 if(typeof takeoffUtc!=="string"||!takeoffUtc.endsWith("Z")||!Number.isFinite(Date.parse(takeoffUtc)))throw new Error("INVALID_TAKEOFF_ANCHOR");
 const t=Date.parse(takeoffUtc),iso=s=>new Date(t+s*1000).toISOString();
 return {status:"CANDIDATE_ONLY",modelVersion:MODEL_VERSION,routeKey:key,route:{canonicalHash:route.canonical_hash,distanceKm:route.computed_km,points:route.fixes.map(f=>({latitude:f.latitude,longitude:f.longitude}))},timing:{...timing,source:"ROUTE_HISTORY_MEDIAN",takeoffUtc,arrivalUtc:iso(timing.durationSeconds),earliestUtc:iso(timing.durationSeconds-timing.windowSeconds),latestUtc:iso(timing.durationSeconds+timing.windowSeconds)},positionStatus:"NOT_YET_VALIDATED"};
}
