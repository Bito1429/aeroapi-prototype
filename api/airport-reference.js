const NAME_OVERRIDES=new Map([
 ["mccarran international airport","Harry Reid International Airport"],
 ["mccarran international","Harry Reid International Airport"],
 ["mccarran intl airport","Harry Reid International Airport"],
 ["mccarran intl","Harry Reid International Airport"],
]);

export function normalizeAirportName(name,codeIata=null){
 const raw=String(name||"").trim();
 const iata=String(codeIata||"").trim().toUpperCase();
 if(iata==="LAS")return"Harry Reid International Airport";
 if(!raw)return null;
 return NAME_OVERRIDES.get(raw.toLowerCase())||raw;
}

export function airportView(a){
 if(!a||typeof a!=="object")return null;
 const codeIata=a.code_iata||a.iata||null;
 const codeIcao=a.code_icao||a.icao||a.code||null;
 const latitude=Number.isFinite(a.latitude)?a.latitude:(Number.isFinite(a.lat)?a.lat:null);
 const longitude=Number.isFinite(a.longitude)?a.longitude:(Number.isFinite(a.lon)?a.lon:null);
 return{
  code_iata:codeIata,
  code_icao:codeIcao,
  name:normalizeAirportName(a.name,codeIata),
  timezone:a.timezone||a.tz||null,
  latitude,
  longitude
 };
}
