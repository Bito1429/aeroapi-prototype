// Europe Option B Premium-trial-only transport. No shared AeroAPI key fallback.
// Never expose this module through a public API route without separate authentication.
const BASE="https://aeroapi.flightaware.com/aeroapi";
export const EUROPE_TRIAL_END="2026-12-04T00:00:00.000Z";
export const MAX_RAW_AGE_MS=30*24*60*60*1000;
export const FORBIDDEN=/(predicted_|foresight)/i;
export const ALLOWED_PATH=/^\/flights\/[A-Za-z0-9_-]{1,80}(?:\/track)?$/;
export function assertTrialWindow(now=new Date()){
 const t=+new Date(now);
 if(!Number.isFinite(t)||t<Date.parse("2026-11-04T00:00:00Z")||t>=Date.parse(EUROPE_TRIAL_END))throw Error("EUROPE_TRIAL_INACTIVE");
}
export function assertTrialKey(env=process.env){
 if(!env.EUROPE_AEROAPI_KEY)throw Error("EUROPE_TRIAL_KEY_MISSING");
 if(env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!=="trial/europe-option-b-20261104")throw Error("EUROPE_BRANCH_SCOPE_VIOLATION");
 return env.EUROPE_AEROAPI_KEY;
}
export function assertCleanDerived(value){
 const serialized=JSON.stringify(value);
 if(FORBIDDEN.test(serialized))throw Error("FORBIDDEN_PREDICTION_FIELD");
 if(/cirium/i.test(serialized))throw Error("CROSS_PROVIDER_CONTAMINATION");
 return value;
}
export function rawExpiresAt(receivedAt){
 const t=Date.parse(receivedAt);
 if(!Number.isFinite(t))throw Error("INVALID_RECEIPT_TIME");
 return new Date(t+MAX_RAW_AGE_MS).toISOString();
}
export function assertFreshRaw(receivedAt,now=new Date()){
 if(Date.parse(rawExpiresAt(receivedAt))<=+new Date(now))throw Error("RAW_RETENTION_EXPIRED");
}
// Fetch once into process memory only. Caller must reduce to permitted derived metrics;
// this transport intentionally has NO database writes or raw-data logging.
export async function europeFetch(path,{env=process.env,fetchImpl=fetch,now=new Date()}={}){
 assertTrialWindow(now);
 const key=assertTrialKey(env);
 if(!ALLOWED_PATH.test(path))throw Error("EUROPE_PATH_NOT_ALLOWED");
 const r=await fetchImpl(BASE+path,{headers:{"x-apikey":key},cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("EUROPE_PROVIDER_HTTP_"+r.status);
 const payload=await r.json();
 return {provider:"FlightAware",received_at:new Date(now).toISOString(),raw_expires_at:rawExpiresAt(new Date(now).toISOString()),payload};
}
// Strictly derived numeric summaries, not a raw track, route or customer package.
export function summarizeTrack(capture){
 if(capture.provider!=="FlightAware")throw Error("PROVIDER_MISMATCH");
 assertFreshRaw(capture.received_at);
 const p=capture.payload?.positions??capture.payload?.track;
 if(!Array.isArray(p))throw Error("TRACK_MISSING");
 return assertCleanDerived({provider:"FlightAware",method:"trial_option_b_track_summary_v1",received_at:capture.received_at,point_count:p.length,has_track:p.length>=2});
}
