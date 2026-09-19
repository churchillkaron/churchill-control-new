const CONTRACT = "AVANTIQO_MUSIC_PREMASTER_LISTENING_REPAIR_PLAN_V1";

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function lower(v){return text(v).toLowerCase();}
function supportedRepair(row={}){
  const family=text(row.family).toUpperCase(), instruction=lower(row.instruction);
  if(family==="TECHNICAL" || family==="TRANSLATION"){
    if(/harsh|bright|fatigu|upper[- ]?mid|aggressive/.test(instruction)) return {code:"LISTENING_REDUCE_HARSHNESS",target:"VOCAL_SUPPORT",change_db:-0.75};
    if(/low[- ]?end|bass|boomy|mud/.test(instruction) && /reduce|less|tight|control/.test(instruction)) return {code:"LISTENING_TIGHTEN_LOW_END",target:"BASS",gain_db:-0.35,low_shelf_db:-0.5};
    if(/dynamic|flat|squash|compress|transient|punch/.test(instruction) && /restore|more|preserve|less|open/.test(instruction)) return {code:"LISTENING_RESTORE_DYNAMICS",target:"COMPRESSED_TRACKS",ratio_scale:0.9,threshold_delta_db:0.75};
  }
  if(family==="PERFORMANCE" || family==="INTENT_FIDELITY" || family==="SONIC_IDENTITY"){
    if(/vocal/.test(instruction) && /(forward|present|closer|up|clear|lead)/.test(instruction)) return {code:"LISTENING_VOCAL_FORWARD",target:"VOCAL",gain_db:0.4,reverb_delta_db:-0.5};
    if(/vocal/.test(instruction) && /(back|behind|too loud|dominant|reduce|lower)/.test(instruction)) return {code:"LISTENING_VOCAL_BACK",target:"VOCAL",gain_db:-0.4,reverb_delta_db:0.35};
    if(/depth|space|reverb|dry|ambien/.test(instruction) && /(more|increase|deeper|space|open)/.test(instruction)) return {code:"LISTENING_MORE_DEPTH",target:"VOCAL_SUPPORT",reverb_delta_db:0.5};
    if(/depth|space|reverb|wash|wet/.test(instruction) && /(less|reduce|drier|clear|wash)/.test(instruction)) return {code:"LISTENING_LESS_DEPTH",target:"VOCAL_SUPPORT",reverb_delta_db:-0.5};
  }
  return null;
}

export function buildProfessionalPremasterListeningRepairPlan(listening={}){
  const dailies=listening?.dailies||{}, brief=dailies?.repair_brief||{};
  const rows=list(brief.repairs), actions=[], unsupported=[];
  const seen=new Set();
  for(const row of rows){const action=supportedRepair(row);if(!action){unsupported.push({family:row?.family||null,instruction:text(row?.instruction)});continue;}if(seen.has(action.code))continue;seen.add(action.code);actions.push({...action,family:row.family,instruction:text(row.instruction)});}
  return {contract:CONTRACT,status:actions.length?"SAFE_REPAIR_PLAN_READY":"NO_SAFE_AUTOMATIC_REPAIR",mix_asset_id:listening?.mix_asset_id||null,direction_hash:brief.direction_hash||null,preproduction_hash:brief.preproduction_hash||null,actions,unsupported,regions:list(brief.regions),preserve_original_sources:true,preserve_approved_direction:true,mutation_authorized:false,requires_explicit_apply:true,requires_new_mix_render:true,requires_fresh_technical_qc:true,requires_fresh_listening:true};
}

export const CreativeMusicPremasterListeningRepairRuntime=Object.freeze({contract:CONTRACT,build:buildProfessionalPremasterListeningRepairPlan});
