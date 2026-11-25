import { neon } from "@neondatabase/serverless";
export async function read(kind,arg){
 const url=process.env.ANY_FLIGHT_READER_URL;if(!url)throw Error("READER_NOT_CONFIGURED");
 const sql=neon(url);
 if(kind==="search")return sql`SELECT flight_id,ident,origin,destination,scheduled_out,expires_at,state FROM any_flight.derived_packages WHERE scheduled_out>now()-interval '2 hours' AND scheduled_out<now()+interval '48 hours' AND (${arg.ident||""}='' OR ident=${arg.ident||""}) AND (${arg.origin||""}='' OR origin=${arg.origin||""}) AND (${arg.destination||""}='' OR destination=${arg.destination||""}) ORDER BY scheduled_out LIMIT 30`;
 const rows=await sql`SELECT flight_id,ident,origin,destination,scheduled_out,expires_at,state,package_json FROM any_flight.derived_packages WHERE flight_id=${arg} LIMIT 1`;return rows[0]||null;
}

export async function rate(client){
 const url=process.env.ANY_FLIGHT_READER_URL;if(!url)throw Error("READER_NOT_CONFIGURED");
 const sql=neon(url);const rows=await sql`SELECT any_flight.consume_delivery_rate(${client}) AS decision`;return rows[0]?.decision;
}
