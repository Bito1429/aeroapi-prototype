import { createPublicKey,verify as verifySignature } from "node:crypto";
const AUD="aevpath-europe-option-b-20261104";
const ISS="https://token.actions.githubusercontent.com";
function decode(s){return JSON.parse(Buffer.from(s,"base64url").toString("utf8"))}
export async function verifyEuropeGitHubOidc(bearer){
 if(typeof bearer!=="string"||bearer.length>9000)throw Error("AUTH_REQUIRED");
 const parts=bearer.split(".");if(parts.length!==3)throw Error("AUTH_INVALID");
 const header=decode(parts[0]),claims=decode(parts[1]);
 if(header.alg!=="RS256"||typeof header.kid!=="string")throw Error("AUTH_ALGORITHM");
 if(claims.iss!==ISS||claims.aud!==AUD||claims.repository!=="Bito1429/aeroapi-prototype"||claims.repository_owner!=="Bito1429")throw Error("AUTH_CLAIMS");
 if(!["refs/heads/main","refs/heads/trial/europe-option-b-20261104"].includes(claims.ref))throw Error("AUTH_REF");
 if(!["schedule","workflow_dispatch"].includes(claims.event_name))throw Error("AUTH_EVENT");
 if(!String(claims.workflow_ref||"").startsWith("Bito1429/aeroapi-prototype/.github/workflows/europe-trial-preview.yml@"))throw Error("AUTH_WORKFLOW");
 const now=Math.floor(Date.now()/1000);if(!Number.isInteger(claims.exp)||claims.exp<now||claims.exp>now+600||!Number.isInteger(claims.iat)||claims.iat>now+30)throw Error("AUTH_EXPIRED");
 const r=await fetch("https://token.actions.githubusercontent.com/.well-known/jwks",{signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error("AUTH_KEYS_UNAVAILABLE");const keys=(await r.json()).keys||[];
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==="RSA"&&k.use==="sig");if(!jwk)throw Error("AUTH_KEY_UNKNOWN");
 if(!verifySignature("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url")))throw Error("AUTH_SIGNATURE");
 return true;
}
