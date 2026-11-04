import { runEurope } from "./europe-option-b-runner.js";
import { verifyEuropeGitHubOidc } from "./europe-github-oidc.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
 try{const h=String(req.headers.authorization||"");if(!h.startsWith("Bearer "))throw Error("AUTH_REQUIRED");await verifyEuropeGitHubOidc(h.slice(7))}
 catch{return res.status(404).json({error:"NOT_FOUND"})}
 try{return res.status(200).json(await runEurope(String(req.query?.phase||"")))}
 catch(e){return res.status(503).json({error:String(e.message).replace(/[^A-Z0-9_]/g,"").slice(0,80)})}
}
