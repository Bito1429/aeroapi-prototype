// Review-only, deliberately NOT on a scheduled/live endpoint.
// Creates finished AevPath packages from existing US production-account captures.
// ZERO FlightAware HTTP calls; no AeroAPI key is read or forwarded.
// Usage, after authorisation and package-table deployment:
//   DATABASE_URL=... US_PACKAGE_FLIGHT_IDS=id1,id2 node scripts/build-us-ready-packages.mjs
//   ... node scripts/build-us-ready-packages.mjs --write
// Default is dry-run; maximum 12 flight IDs per invocation.
import {createHash} from "node:crypto";
import {db} from "../api/db.js";
import {buildDraftPackage} from "../api/package-core.js";
import {toChesterV1} from "../api/chester-schema.js";

const write=process.argv.includes("--write");
const ids=[...new Set((process.env.US_PACKAGE_FLIGHT_IDS||"").split(",").map(v=>v.trim()).filter(Boolean))];
if(!ids.length||ids.length>12||ids.some(id=>!/^[A-Za-z0-9_-]{1,90}$/.test(id)))
  throw Error("REQUIRE_1_TO_12_APPROVED_FLIGHT_IDS");
const sql=db();
for(const id of ids){
 try{
  const rows=await sql`SELECT j.fa_flight_id,j.origin,j.destination,j.scheduled_on_initial,j.final_actual_out,
   c.captured_at,c.raw_capture IS NOT NULL AS source_exists
   FROM flight_jobs j JOIN LATERAL (
    SELECT captured_at,raw_capture FROM flight_captures
    WHERE flight_job_id=j.id ORDER BY captured_at DESC LIMIT 1
   ) c ON true WHERE j.fa_flight_id=${id} LIMIT 1`;
  const row=rows[0];
  if(!row||!row.source_exists)throw Error("NO_US_CAPTURE");
  if(!String(row.origin).startsWith("K")||!String(row.destination).startsWith("K"))throw Error("NOT_US_MARKET");
  const age=Date.now()-Date.parse(row.captured_at);
  if(age<0||age>=24*3600000)throw Error("CAPTURE_OVER_24_HOURS__DO_NOT_REUSE");
  if(!row.scheduled_on_initial||!Number.isFinite(Date.parse(row.scheduled_on_initial)))throw Error("MISSING_SCHEDULED_LANDING");
  const expiresAt=new Date(Date.parse(row.scheduled_on_initial)+7*86400000).toISOString();
  if(Date.parse(expiresAt)<=Date.now())throw Error("PACKAGE_ALREADY_EXPIRED");
  const built=await buildDraftPackage(id);
  if(built.status!==200||built.body?.status!=="READY")throw Error("NO_READY_DRAFT");
  const f=built.body.flight;
  const pkg=toChesterV1(built.body,{
   airports:{origin:f.origin_airport,destination:f.destination_airport},
   airline:f.airline,aircraftType:f.aircraft_type,expiresAt
  });
  // Only derived package, not source capture or provider reply, enters storage.
  const payload=JSON.stringify(pkg);
  if(/raw_capture|raw_receipts|predicted_|foresight/i.test(payload))throw Error("FORBIDDEN_SOURCE_FIELD");
  const etag='"'+createHash("sha256").update(payload).digest("hex")+'"';
  if(write){
   const inserted=await sql`INSERT INTO public.chester_ready_packages(
     flight_id,package_json,etag,source_account,source_captured_at,
     scheduled_arrival_at,generated_at,expires_at
   ) VALUES(
     ${id},${payload}::jsonb,${etag},'US_PRODUCTION',${row.captured_at},
     ${row.scheduled_on_initial},${pkg.generated_at},${expiresAt}
   ) ON CONFLICT(flight_id) DO NOTHING RETURNING flight_id`;
   console.log(JSON.stringify({flight_id:id,result:inserted.length?"STORED":"ALREADY_STORED",etag,expires_at:expiresAt}));
  }else{
   console.log(JSON.stringify({flight_id:id,result:"READY_DRY_RUN",bytes:Buffer.byteLength(payload),etag,expires_at:expiresAt}));
  }
 }catch(e){console.log(JSON.stringify({flight_id:id,result:"NOT_STORED",reason:String(e.message).slice(0,90)}))}
}
