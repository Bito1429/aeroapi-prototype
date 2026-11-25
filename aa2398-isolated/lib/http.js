import {timingSafeEqual} from "node:crypto";
export const reply=(res,status,body)=>{res.setHeader("cache-control","private, no-store");return res.status(status).json(body)};
export function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||b.length<32||a.length>512)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function deliveryState(r,now=Date.now()){
 if(!r)return "PENDING_SOURCE";
 if(r.state==="CANCELLED"||r.state==="DEPARTED")return r.state;
 if(r.state!=="READY")return r.state;
 const t=x=>x instanceof Date?x.getTime():Date.parse(x),out=t(r.scheduled_out),expiry=t(r.expires_at);
 if(!Number.isFinite(out)||!Number.isFinite(expiry))return "PENDING_SOURCE";
 if(now>=out)return "DEPARTED";if(now>=expiry)return "EXPIRED";
 return r.package_json?"READY":"PENDING_SOURCE";
}
