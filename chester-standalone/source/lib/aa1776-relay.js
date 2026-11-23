// Narrow Chester-only access to the AA1776, same-day derived package relay.
// This module has no FlightAware credentials, no provider network access and no writes.
export const ALLOWED_DATES=new Set(["2026-11-23","2026-11-24","2026-11-26"]);
const stamp=x=>new Date(x||0).getTime();
export async function aa1776ByDate(sql,date){
 if(!ALLOWED_DATES.has(date))return null;
 const rows=await sql`select r.flight_date,r.fa_flight_id,r.source_captured_at,r.scheduled_out,r.expires_at,
 r.package_json,s.state as upstream_state,s.reason as upstream_reason
 from aa1776_planb_relay r left join aa1776_planb_state s on s.flight_date=r.flight_date
 where r.flight_date=${date}::date limit 1`;
 return rows[0]||null;
}
export async function aa1776ById(sql,id){
 if(typeof id!=="string"||id.length>160||!id)return null;
 const rows=await sql`select r.flight_date,r.fa_flight_id,r.source_captured_at,r.scheduled_out,r.expires_at,
 r.package_json,s.state as upstream_state,s.reason as upstream_reason
 from aa1776_planb_relay r left join aa1776_planb_state s on s.flight_date=r.flight_date
 where r.fa_flight_id=${id} order by r.flight_date desc limit 1`;
 return rows[0]||null;
}
export function aa1776SaleState(row,nowIso=new Date().toISOString()){
 if(!row)return"PENDING_ROUTE";
 const t=stamp(nowIso);
 if(!Number.isFinite(t))return"PENDING_ROUTE";
 if(row.upstream_state==="CANCELLED")return"CANCELLED";
 if(row.upstream_state==="DEPARTED")return"DEPARTED";
 // Fail closed once scheduled gate-out has passed. A stale estimate cannot reopen sales.
 const scheduled=stamp(row.scheduled_out);
 if(!Number.isFinite(scheduled)||scheduled<=t)return"DEPARTED";
 if(stamp(row.expires_at)<=t)return"PENDING_ROUTE";
 const pkg=row.package_json;
 if(row.upstream_state!=="READY"||pkg?.schema!=="aevpath.package.v1"||
    pkg?.market!=="US"||pkg?.flight_id!==row.fa_flight_id)return"PENDING_ROUTE";
 const pkgDate=String(pkg?.flight?.scheduled_departure||"").slice(0,10);
 const rowDate=Number.isFinite(stamp(row.flight_date))?new Date(row.flight_date).toISOString().slice(0,10):"";
 if(!ALLOWED_DATES.has(rowDate)||rowDate!==pkgDate)return"PENDING_ROUTE";
 if(pkg?.flight?.origin?.icao!=="KPHL"||pkg?.flight?.destination?.icao!=="KBOS")return"PENDING_ROUTE";
 return"SELLABLE";
}
export function aa1776Summary(row,nowIso=new Date().toISOString()){
 const state=aa1776SaleState(row,nowIso),pkg=row?.package_json,flight=pkg?.flight||{};
 const checkAgain=new Date(stamp(nowIso)+15*60000).toISOString();
 return{
   flight_id:row.fa_flight_id,ident:flight.ident||"AAL1776",
   origin:"KPHL",destination:"KBOS",
   scheduled_out:row.scheduled_out,scheduled_on:flight.scheduled_arrival||null,
   status:state==="SELLABLE"?"SCHEDULED":state,
   sale_state:state,sellable:state==="SELLABLE",
   package_status:state==="SELLABLE"?"CAPTURE_AVAILABLE":"NOT_SELLABLE",
   last_capture_at:row.source_captured_at,
   ...(state==="PENDING_ROUTE"?{check_again_after:checkAgain}:{}),
 };
}
