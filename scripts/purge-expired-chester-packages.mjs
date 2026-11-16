// Review-only maintenance task; does not access FlightAware or the US campaign.
// Must be scheduled separately ONLY after package store approval and deployment.
// Default dry-run; --delete must be explicitly selected in approved production job.
import {db} from "../api/db.js";
const sql=db();
const r=await sql`SELECT count(*)::int AS n FROM public.chester_ready_packages WHERE expires_at<=now()`;
if(process.argv.includes("--delete")){
 const out=await sql`DELETE FROM public.chester_ready_packages WHERE expires_at<=now() RETURNING flight_id`;
 console.log(JSON.stringify({removed:out.length}));
}else console.log(JSON.stringify({would_remove:r[0]?.n||0,dry_run:true}));
