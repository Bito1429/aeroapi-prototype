export const ETA_CALIBRATION={
 version:"eta-us-v1-2026-10-07",
 calibration_period:["2026-09-08","2026-09-22"],
 validation_period:["2026-09-23","2026-10-02"],
 baseline_source:"FILED_ETE",
 predeparture:{
  center_rule:"estimated_off_plus_filed_ete",
  half_width_minutes:17,
  calibration_p80_abs_error_minutes:16.8166666667,
  validation_coverage:0.8341110217
 },
 airborne:{
  center_rule:"detected_takeoff_plus_filed_ete",
  half_width_minutes:9,
  calibration_p80_abs_error_minutes:8.6666666667,
  validation_coverage:0.8242960579
 }
};

export function addSeconds(iso,seconds){
 if(!iso||!Number.isFinite(seconds))return null;
 const t=new Date(iso).getTime();if(!Number.isFinite(t))return null;
 return new Date(t+seconds*1000).toISOString();
}
export function windowAround(centerIso,halfWidthMinutes){
 if(!centerIso||!Number.isFinite(halfWidthMinutes))return null;
 const t=new Date(centerIso).getTime();if(!Number.isFinite(t))return null;
 const d=halfWidthMinutes*60000;
 return{early:new Date(t-d).toISOString(),late:new Date(t+d).toISOString()};
}
export function airborneOffsets(filedEteSeconds){
 const duration=filedEteSeconds==null||filedEteSeconds===""?NaN:Number(filedEteSeconds);
 if(!Number.isFinite(duration)||duration<=0)return null;
 const half=ETA_CALIBRATION.airborne.half_width_minutes*60;
 return{
  landing_center_offset_seconds:duration,
  landing_early_offset_seconds:duration-half,
  landing_late_offset_seconds:duration+half
 };
}
// Isolated Wed/Thu AA1776 only: median actual takeoff-to-touchdown time (8 scored KPHL-KBOS jobs, 14 Sep–2 Oct 2026); leave-one-out MAE 4.896 min. No flight-provider duration used on these dates.
export const AA1776_HISTORICAL_TIMING=Object.freeze({version:"phl-bos-median-8-2026-11-25",seconds:3282,sample_count:8});
export function aa1776Timing(flight,flightDate){
 if(["2026-11-25","2026-11-26"].includes(flightDate)){
  if(flight?.origin!=="KPHL"||flight?.destination!=="KBOS"||! /^(?:AAL|AA)1776$/.test(String(flight?.ident_icao||flight?.ident||"").toUpperCase()))return {seconds:null,historical:true};
  return {seconds:AA1776_HISTORICAL_TIMING.seconds,historical:true};
 }
 return {seconds:Number(flight?.filed_ete),historical:false};
}
export function etaPackage({estimatedOff=null,filedEteSeconds=null,historicalAirborneSeconds=null}={}){
 const historical=historicalAirborneSeconds!==null;
 const duration=historical?Number(historicalAirborneSeconds):(filedEteSeconds==null||filedEteSeconds===""?NaN:Number(filedEteSeconds));
 const validDuration=Number.isFinite(duration)&&duration>0;
 const preCenter=estimatedOff&&validDuration?addSeconds(estimatedOff,duration):null;
 return{
  calibration_version:historical?AA1776_HISTORICAL_TIMING.version:ETA_CALIBRATION.version,
  baseline_source:historical?"HISTORICAL_ROUTE_MEDIAN":ETA_CALIBRATION.baseline_source,
  duration_seconds:validDuration?duration:null,
  semantics:"LANDING_NOT_GATE_ARRIVAL",
  predeparture:{
   landing_time_center:preCenter,
   landing_window:preCenter?windowAround(preCenter,ETA_CALIBRATION.predeparture.half_width_minutes):null,
   half_width_minutes:ETA_CALIBRATION.predeparture.half_width_minutes,
   center_rule:historical?"estimated_off_plus_historical_duration":ETA_CALIBRATION.predeparture.center_rule,
   validated_coverage:historical?null:ETA_CALIBRATION.predeparture.validation_coverage
  },
  airborne:{
   center_rule:historical?"detected_takeoff_plus_historical_duration":ETA_CALIBRATION.airborne.center_rule,
   half_width_minutes:ETA_CALIBRATION.airborne.half_width_minutes,
   validated_coverage:historical?null:ETA_CALIBRATION.airborne.validation_coverage,
   relative_to_detected_takeoff:validDuration?airborneOffsets(duration):null
  }
 };
}
