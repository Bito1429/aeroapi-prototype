// Resolver engine core; fail closed until authoritative navdata is loaded.
export const RESOLVER_ENGINE_VERSION="R2_ENGINE_V0_2026-09-21";
export const RESOLVER_COMPARISON_POLICY=Object.freeze({
  point_tolerance_nm:1.0,
  severe_disagreement_nm:5.0,
  route_agreement_fraction:0.95,
  procedure_authority:"FAA_CIFP",
  fix_airway_authority:"FAA_NASR",
  airac_fallback:"NONE"
});

const LATLON_PATTERNS=[
  /^\d{2,4}[NS]\/\d{3,5}[EW]$/i,
  /^\d{4}[NS]\d{5}[EW]$/i
];
const AIRWAY_RE=/^(?:[JQVTLRYAMBGNPW]\d{1,3}|U[JQVTLRYAMBGNPW]\d{1,3}|RTE\d{1,3})$/i;
const PROC_RE=/^[A-Z]{3,6}\d[A-Z0-9]?$/i;

export function classifyToken(token){
  const t=String(token||"").trim().toUpperCase();
  if(!t)return"EMPTY";
  if(LATLON_PATTERNS.some(r=>r.test(t)))return"LATLON";
  if(AIRWAY_RE.test(t))return"AIRWAY";
  if(PROC_RE.test(t))return"PROCEDURE_CANDIDATE";
  if(/^[A-Z0-9]{3,6}$/.test(t))return"POINT_CANDIDATE";
  return"UNKNOWN";
}

export function tokenizeRoute(route){
  return String(route||"").trim().split(/\s+/).filter(Boolean).map((raw_token,ordinal)=>({
    ordinal,
    raw_token,
    normalized_token:raw_token.toUpperCase(),
    token_class:classifyToken(raw_token)
  }));
}

export function selectEffectiveCycle(instant,cycles=[]){
  const t=new Date(instant).getTime();
  if(!Number.isFinite(t))return null;
  const matches=cycles.filter(c=>{
    const a=new Date(c.effective_from).getTime(),b=new Date(c.effective_to).getTime();
    return Number.isFinite(a)&&Number.isFinite(b)&&a<=t&&t<b;
  });
  return matches.length===1?matches[0]:null;
}

export function canResolveTokenToObject(tokenClass,objectType,{routeJurisdiction=null,objectJurisdiction=null,loadedJurisdictions=[]}={}){
  const tc=String(tokenClass||"").toUpperCase(),ot=String(objectType||"").toUpperCase();
  if(tc==="AIRWAY"&&["POINT","AIRPORT","VOR","NDB","WAYPOINT","FIX"].includes(ot))return false;
  if(routeJurisdiction&&objectJurisdiction&&routeJurisdiction!==objectJurisdiction&&!loadedJurisdictions.includes(routeJurisdiction))return false;
  return true;
}

export function compareCommonNamedFixes(a=[],b=[]){
  const byName=new Map(b.filter(x=>x?.name&&Number.isFinite(x.latitude)&&Number.isFinite(x.longitude)).map(x=>[String(x.name).toUpperCase(),x]));
  const rows=[];
  for(const x of a){
    if(!x?.name||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude))continue;
    const y=byName.get(String(x.name).toUpperCase());if(!y)continue;
    const R=3440.065,rad=Math.PI/180,p1=x.latitude*rad,p2=y.latitude*rad,dp=(y.latitude-x.latitude)*rad,dl=(y.longitude-x.longitude)*rad;
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    const nm=2*R*Math.asin(Math.min(1,Math.sqrt(h)));
    rows.push({name:String(x.name).toUpperCase(),distance_nm:+nm.toFixed(3)});
  }
  const within=rows.filter(r=>r.distance_nm<=RESOLVER_COMPARISON_POLICY.point_tolerance_nm).length;
  const severe=rows.filter(r=>r.distance_nm>RESOLVER_COMPARISON_POLICY.severe_disagreement_nm).length;
  const fraction=rows.length?within/rows.length:0;
  return{common_count:rows.length,within_tolerance:within,severe_count:severe,agreement_fraction:+fraction.toFixed(4),agreement:rows.length>0&&fraction>=RESOLVER_COMPARISON_POLICY.route_agreement_fraction&&severe===0,points:rows};
}

export function resolverEnvelope({route,origin=null,destination=null,nav_cycle_code=null}={}){
  const tokens=tokenizeRoute(route);
  return{
    resolver_rule_version:RESOLVER_ENGINE_VERSION,
    nav_cycle_code,
    origin_icao:origin,
    destination_icao:destination,
    raw_route:route||"",
    status:"PARTIAL",
    confidence:"NONE",
    tokens:tokens.map(t=>({...t,decision:"UNRESOLVED",reason_code:"NAVDATA_NOT_LOADED"})),
    unresolved_tokens:tokens.map(t=>t.normalized_token),
    ambiguous_tokens:[],
    geometry:null,
    diagnostics:{stage:"TOKENIZED_ONLY",token_count:tokens.length}
  };
}
