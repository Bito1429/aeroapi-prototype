import { neon } from "@neondatabase/serverless";
import { assertTrialWindow, assertTrialKey } from "./europe-option-b-core.js";
const UK_LIMIT=150, REQUEST_LIMIT=1000;
const q=()=>{if(!process.env.EUROPE_DATABASE_URL)throw Error("EUROPE_DB_MISSING");return neon(process.env.EUROPE_DATABASE_URL)};
const now=()=>new Date().toISOString();
const safeId=s=>/^[A-Za-z0-9_-]{1,90}$/.test(s);
async function api(path){
  assertTrialWindow();const key=assertTrialKey();
  const sql=q();const [c]=await sql`select count(*)::int n from europe_option_b.request_audit where day=current_date`;
  if(c.n>=REQUEST_LIMIT)throw Error("EUROPE_REQUEST_CAP");
  const r=await fetch("https://aeroapi.flightaware.com/aeroapi"+path,{headers:{"x-apikey":key},cache:"no-store",signal:AbortSignal.timeout(12000)});
  const warning=r.headers.get("warning")||r.headers.get("x-ratelimit-remaining")||"";
  const stopped=r.status===429||r.status===402||/quota|limit|usage|billing|credit/i.test(warning);
  await sql`insert into europe_option_b.request_audit(day,status,warning,halted) values(current_date,${r.status},${warning.slice(0,160)},${stopped})`;
  if(stopped){await sql`insert into europe_option_b.trial_state(id,halted,reason) values(1,true,'PROVIDER_USAGE_WARNING') on conflict(id) do update set halted=true,reason='PROVIDER_USAGE_WARNING'`;throw Error("EUROPE_USAGE_STOP")}
  if(!r.ok)throw Error("EUROPE_PROVIDER_HTTP_"+r.status);
  return r.json();
}
export async function runEurope(phase){
  assertTrialWindow();assertTrialKey();if(!["seed","predict","score"].includes(phase))throw Error("PHASE_NOT_ALLOWED");
  const sql=q();const [state]=await sql`select halted from europe_option_b.trial_state where id=1`;
  if(state?.halted)throw Error("EUROPE_HALTED");
  if(phase==="seed"){
    // Provider history requires separately verified endpoints and historical-track allowance.
    // Do not infer history from pretrial cached tracks.
    return {phase,status:"HISTORY_ENDPOINT_UNVERIFIED",calls:0};
  }
  if(phase==="predict"){
    const routes=await sql`select route_key from europe_option_b.route_manifest order by uk_priority desc,route_key limit 334`;
    const [cnt]=await sql`select count(*)::int n from europe_option_b.trial_flights where predicted_at::date=current_date`;
    if(cnt.n>=UK_LIMIT)return {phase,status:"DAILY_FLIGHT_CAP",calls:0};
    // Do not lock a prediction without a fresh-trial-derived route seed.
    const [seeds]=await sql`select count(*)::int n from europe_option_b.route_seeds`;
    return {phase,status:seeds.n?"FLIGHT_DISCOVERY_NOT_CONFIGURED":"AWAITING_SIX_FRESH_TRACKS",route_count:routes.length,calls:0};
  }
  return {phase,status:"SCORING_PENDING_FLIGHT_CAPTURE",calls:0};
}
