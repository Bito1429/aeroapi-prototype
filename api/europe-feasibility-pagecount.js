import{aero,json}from"./lib.js";

const OPS=["RYR","EZY","EXS","WZZ"];
const START="2026-09-27T00:00:00Z";
const END="2026-09-28T00:00:00Z";

async function countPages(op){
  let path="/history/operators/"+op+"/flights";
  let params={start:START,end:END,max_pages:1};
  let pages=0,flights=0;
  while(path&&pages<500){
    const b=await aero(path,params);
    pages++;
    flights+=(b.flights||[]).length;
    const next=b.links?.next||null;
    if(!next)break;
    path=next;
    params={};
  }
  return{pages,flights,estimated_45d_pages:pages*45,estimated_45d_cost_usd:+(pages*45*0.02).toFixed(2)};
}

export default async function handler(req,res){
  try{
    const out={ok:true,start:START,end:END,price_per_operator_history_result_set_usd:0.02,operators:{},totals:{}};
    let totalPages=0,totalFlights=0;
    for(const op of OPS){
      try{
        const x=await countPages(op);
        out.operators[op]=x;
        totalPages+=x.pages;
        totalFlights+=x.flights;
      }catch(e){
        out.operators[op]={error:e.message,status:e.status||null,detail:e.body||null};
      }
    }
    out.totals={
      one_day_pages:totalPages,
      one_day_flights:totalFlights,
      estimated_45d_pages:totalPages*45,
      estimated_45d_enumeration_cost_usd:+(totalPages*45*0.02).toFixed(2),
      frozen_track_calls:270,
      estimated_track_cost_usd:16.20,
      estimated_total_before_misc_lookup_costs_usd:+(totalPages*45*0.02+16.20).toFixed(2)
    };
    json(res,200,out);
  }catch(e){json(res,e.status||500,{ok:false,error:e.message,detail:e.body||null});}
}
