import{aero,json}from"./lib.js";

const OPS=["RYR","EZY","EXS","WZZ"];
const CUTOFF="2026-09-28T23:59:59Z";
const START="2026-09-27T00:00:00Z";

function slim(f){
 return{
  fa_flight_id:f.fa_flight_id,
  ident:f.ident,
  ident_icao:f.ident_icao,
  operator:f.operator,
  operator_icao:f.operator_icao,
  codeshares:f.codeshares,
  origin:f.origin,
  destination:f.destination,
  scheduled_out:f.scheduled_out,
  scheduled_in:f.scheduled_in,
  actual_out:f.actual_out,
  actual_in:f.actual_in,
  status:f.status
 };
}

export default async function handler(req,res){
 try{
  const out={ok:true,start:START,cutoff:CUTOFF,operators:{}};
  for(const op of OPS){
   try{
    const b=await aero(`/history/operators/${op}/flights`,{start:START,end:CUTOFF,max_pages:1});
    const flights=b.flights||b.arrivals||b.departures||[];
    out.operators[op]={
      count:flights.length,
      top_level_keys:Object.keys(b),
      links:b.links||null,
      sample:flights.slice(0,3).map(slim)
    };
   }catch(e){
    out.operators[op]={error:e.message,status:e.status||null,detail:e.body||null};
   }
  }
  json(res,200,out);
 }catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null});}
}
