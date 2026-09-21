import{json}from"./lib.js";
import{resolverEnvelope}from"./resolver-lib.js";

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,error:"POST required"});
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return json(res,400,{ok:false,error:"Invalid JSON"});}}
  const route=body?.route;
  if(!route)return json(res,400,{ok:false,error:"route is required"});
  return json(res,200,{ok:true,resolver:resolverEnvelope({
    route,
    origin:body?.origin||null,
    destination:body?.destination||null,
    nav_cycle_code:body?.nav_cycle_code||null
  })});
}
