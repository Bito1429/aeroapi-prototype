// Resolver engine core; fail closed until authoritative navdata is loaded.\nexport const RESOLVER_ENGINE_VERSION="R2_ENGINE_V0_2026-09-21";

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
