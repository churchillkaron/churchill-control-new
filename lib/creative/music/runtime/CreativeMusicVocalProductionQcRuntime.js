import { buildMusicVocalIntelligence } from "./CreativeMusicVocalIntelligenceRuntime.js";
import { inspectMusicVocalProduction, normalizeMusicVocalProductionRole } from "./CreativeMusicVocalProductionBusRuntime.js";
import { analyzeMusicVocalStackAlignment } from "./CreativeMusicVocalStackAlignmentRuntime.js";

const CONTRACT="AVANTIQO_MUSIC_VOCAL_PRODUCTION_QC_V1";
function text(v){return String(v??"").trim();}
function activeVocalClips(session={}){const out=[];for(const track of session.tracks||[]){if(String(track.type).toLowerCase()!=="vocal"||track.mute===true)continue;for(const clip of track.clips||[]){if(clip.muted===true)continue;out.push({track,clip});}}return out;}
export function evaluateMusicVocalProductionQc(session={}){
  const routing=inspectMusicVocalProduction(session),intelligence=buildMusicVocalIntelligence({multitrack_session:session}),alignment=analyzeMusicVocalStackAlignment(session),blockers=[],reviewFlags=[],clips=activeVocalClips(session),evidenceByClip=new Map((intelligence.clips||[]).map(row=>[row.clip_id,row]));
  if(!routing.vocal_track_count)return{contract:CONTRACT,applicable:false,technical_ready_for_listening_review:true,release_certified:false,human_listening_review_required:false,blockers:[],review_flags:[],routing,intelligence};
  if(!routing.professional_vocal_routing_ready)blockers.push("VOCAL_PRODUCTION_ROUTING_NOT_READY");
  blockers.push(...alignment.blockers);
  if(routing.missing_role_track_ids.length)blockers.push("VOCAL_PRODUCTION_DECLARED_ROLES_REQUIRED");
  if(routing.lead_track_count<1)blockers.push("VOCAL_PRODUCTION_LEAD_REQUIRED");
  const vocalMaster=(session.buses||[]).find(bus=>bus.id==="bus-vocal-all"&&bus.vocal_production_managed===true);if(!vocalMaster)blockers.push("VOCAL_MASTER_BUS_REQUIRED");
  const parallel=(session.buses||[]).find(bus=>bus.id==="bus-vocal-parallel"&&bus.effect_type==="compressor"&&bus.vocal_production_managed===true);if(!parallel)blockers.push("VOCAL_PARALLEL_COMPRESSION_BUS_REQUIRED");
  for(const track of (session.tracks||[]).filter(row=>String(row.type).toLowerCase()==="vocal"&&row.mute!==true)){
    const role=normalizeMusicVocalProductionRole(track.vocal_role);if(!role)continue;
    if(track.vocal_production?.phase_widening_used===true||track.vocal_production?.haas_delay_used===true)blockers.push(`VOCAL_PHASE_WIDENING_FORBIDDEN:${track.id}`);
    if(track.vocal_production?.contract!=="AVANTIQO_MUSIC_VOCAL_PRODUCTION_BUS_V1")blockers.push(`VOCAL_PRODUCTION_TRACK_BINDING_REQUIRED:${track.id}`);
    if(track.vocal_production?.manual_pan_preserved!==true&&track.vocal_production_managed_pan!==true)blockers.push(`VOCAL_PAN_PROVENANCE_REQUIRED:${track.id}`);
  }
  for(const {track,clip} of clips){const evidence=evidenceByClip.get(text(clip.id));if(!evidence){blockers.push(`VOCAL_CURRENT_ENGINEERING_EVIDENCE_REQUIRED:${track.id}:${clip.id}`);continue;}if(!evidence.engineering?.measured)blockers.push(`VOCAL_ENGINEERING_MEASUREMENT_REQUIRED:${track.id}:${clip.id}`);if(evidence.engineering?.sibilance_elevated===true)reviewFlags.push({code:"VOCAL_SIBILANCE_ELEVATED",track_id:track.id,clip_id:clip.id,measured_db:evidence.engineering.sibilance_vs_presence_db});if(evidence.engineering?.sub_rumble_elevated===true)reviewFlags.push({code:"VOCAL_LOW_FREQUENCY_CONTAMINATION",track_id:track.id,clip_id:clip.id,measured_db:evidence.engineering.rumble_vs_body_db});if(evidence.engineering?.presence_deficit===true)reviewFlags.push({code:"VOCAL_PRESENCE_DEFICIT",track_id:track.id,clip_id:clip.id,measured_db:evidence.engineering.body_vs_presence_db});if((evidence.engineering?.air_noise_event_candidates||[]).length)reviewFlags.push({code:"VOCAL_AIR_NOISE_CANDIDATES",track_id:track.id,clip_id:clip.id,count:evidence.engineering.air_noise_event_candidates.length});if(evidence.engineering?.dynamics?.active_dynamic_range_db!=null)reviewFlags.push({code:"VOCAL_DYNAMIC_RANGE_MEASURED",track_id:track.id,clip_id:clip.id,active_dynamic_range_db:evidence.engineering.dynamics.active_dynamic_range_db,median_crest_db:evidence.engineering.dynamics.median_crest_db,informational:true});}
  const unique=[...new Set(blockers)];return{contract:CONTRACT,applicable:true,technical_ready_for_listening_review:unique.length===0,release_certified:false,human_listening_review_required:true,blockers:unique,review_flags:reviewFlags,routing,vocal_stack_alignment:alignment,intelligence_summary:{clip_count:intelligence.clip_count,sibilance_available:intelligence.sibilance_available,tonal_balance_available:intelligence.tonal_balance_available,dynamics_envelope_available:intelligence.dynamics_envelope_available},source_audio_rewritten:false,artistic_quality_inferred:false,automatic_release_authorized:false};
}
export const CreativeMusicVocalProductionQcRuntime=Object.freeze({contract:CONTRACT,evaluate:evaluateMusicVocalProductionQc});
