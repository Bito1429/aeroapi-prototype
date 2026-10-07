import{json}from"../../../../lib.js";
import{buildDraftPackage,etagFor}from"../../../../package-core.js";

export default async function handler(req,res){try{
 const id=String(req.query?.id||"").trim();
 if(!id)return json(res,400,{error:"id required"});
 const out=await buildDraftPackage(id);
 if(out.status!==200)return json(res,out.status,out.body);
 const tag=etagFor(out.body);
 res.setHeader("ETag",tag);
 res.setHeader("Cache-Control","private, no-cache");
 if(String(req.headers["if-none-match"]||"")===tag){res.statusCode=304;return res.end();}
 return json(res,200,out.body);
}catch(e){return json(res,500,{error:e.message});}}
