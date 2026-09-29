import{aero,json}from"./lib.js";

const OPS=["RYR","EZY","EXS","WZZ"];
const START="2026-09-27T00:00:00Z";
const END="2026-09-28T00:00:00Z";

export default async function handler(req,res){
  const out={ok:true,start:START,end:END,operators:{}};
  for(const op of OPS){
    try{
      const b=await aero("/history/operators/"+op+"/flights",{start:START,end:END,max_pages:1});
      const flights=b.flights||[];
      const first=flights.find(f=>f.fa_flight_id);
      let track=null;
      if(first){
        try{
          const tb=await aero("/history/flights/"+first.fa_flight_id+"/track");
          const positions=tb.positions||tb.track||[];
          track={fa_flight_id:first.fa_flight_id,position_count:positions.length,top_level_keys:Object.keys(tb)};
        }catch(e){
          track={error:e.message,status:e.status||null,detail:e.body||null};
        }
      }
      out.operators[op]={
        count:flights.length,
        num_pages:b.num_pages??null,
        route_field_present:flights.some(f=>Object.prototype.hasOwnProperty.call(f,"route")),
        route_example:flights.find(f=>f.route)?.route??null,
        track
      };
    }catch(e){
      out.operators[op]={error:e.message,status:e.status||null,detail:e.body||null};
    }
  }
  json(res,200,out);
}
