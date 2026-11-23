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
 if(typeof a==="string")a={code_icao:a};
 if(!a||typeof a!=="object")return null;
 const codeIcao=String(a.code_icao||a.icao||a.code||"").toUpperCase();
 const known=aa1776AirportMetadata(codeIcao);
 const codeIata=a.code_iata||a.iata||known?.code_iata||null;
 const latitude=Number.isFinite(a.latitude)?a.latitude:(Number.isFinite(a.lat)?a.lat:known?.latitude??null);
 const longitude=Number.isFinite(a.longitude)?a.longitude:(Number.isFinite(a.lon)?a.lon:known?.longitude??null);
 return{
  code_iata:codeIata,
  code_icao:codeIcao||null,
  name:normalizeAirportName(a.name||known?.name,codeIata),
  timezone:a.timezone||a.tz||known?.timezone||null,
  latitude,
  longitude
 };
}

// Isolated AA1776 airport metadata from MIT-licensed airportsdata ICAO registry,
// queried 2026-11-23; never inferred from flight path.
const AA1776_AIRPORTS=Object.freeze({
 KPHL:{code_iata:"PHL",code_icao:"KPHL",name:"Philadelphia International Airport",timezone:"America/New_York",latitude:39.872084,longitude:-75.240663},
 KBOS:{code_iata:"BOS",code_icao:"KBOS",name:"General Edward Lawrence Logan International Airport",timezone:"America/New_York",latitude:42.362944,longitude:-71.006389}
});
export function aa1776AirportMetadata(code){return AA1776_AIRPORTS[String(code||"").toUpperCase()]||null;}

// Static airport identity metadata for persisted captures which predate airportView.
// Coordinates are taken from captured route fixes, never guessed.
const KNOWN_AIRPORTS=Object.freeze({
 KCLE:["CLE","Cleveland Hopkins International Airport","America/New_York"],
 KEWR:["EWR","Newark Liberty International Airport","America/New_York"],
 KSAV:["SAV","Savannah/Hilton Head International Airport","America/New_York"],
 KJFK:["JFK","John F. Kennedy International Airport","America/New_York"],
 KLAX:["LAX","Los Angeles International Airport","America/Los_Angeles"],
 KATL:["ATL","Hartsfield-Jackson Atlanta International Airport","America/New_York"],
 KORD:["ORD","O'Hare International Airport","America/Chicago"],
 KSFO:["SFO","San Francisco International Airport","America/Los_Angeles"],
 KDEN:["DEN","Denver International Airport","America/Denver"],
 KDFW:["DFW","Dallas Fort Worth International Airport","America/Chicago"]
});
export function airportFromFiledFix(icao,fix){
 const code=String(icao||"").toUpperCase(),meta=KNOWN_AIRPORTS[code];
 if(!meta||!fix||!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude))return null;
 return {code_iata:meta[0],code_icao:code,name:meta[1],timezone:meta[2],latitude:fix.latitude,longitude:fix.longitude};
}
