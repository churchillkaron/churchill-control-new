import crypto from "node:crypto";

export const AVANTIQO_CINEMA_ENGINE_CERTIFICATION_CONTRACT="AVANTIQO_CINEMA_ENGINE_CERTIFICATION_V1";
const ENGINES=Object.freeze([
  {id:"MODEL_RIG_HOST",prepaid:true,visual:false,contracts:["AVANTIQO_MECHANICAL_RIG_V1","AVANTIQO_MODEL_ASSET_BINDING_V1"]},
  {id:"MATERIAL_LAB",prepaid:true,visual:true,contracts:["AVANTIQO_MATERIAL_LAB_V1","AVANTIQO_MATERIAL_TEXTURE_BINDING_V1","AVANTIQO_MATERIAL_BAKE_V1"]},
  {id:"CYCLES_AOV_RENDER",prepaid:true,visual:true,contracts:["AVANTIQO_CYCLES_PRODUCTION_RENDER_V1"]},
  {id:"SIMULATION_PHYSICS",prepaid:true,visual:true,contracts:["CREATIVE_PHYSICS_SIMULATION_V1"]},
  {id:"CINEMATIC_MOTION",prepaid:true,visual:true,contracts:["AVANTIQO_CINEMATIC_MOTION_DESIGN_V1","AVANTIQO_CINEMATIC_MOTION_DESIGN_RENDER_V1"]},
  {id:"MATCHMOVE_3D",prepaid:true,visual:false,contracts:["AVANTIQO_OPENCV_MATCHMOVE_V1","AVANTIQO_MATCHMOVE_AUTHORITY_V1"]},
  {id:"ROTO_MATTING",prepaid:true,visual:true,contracts:["AVANTIQO_OPENCV_ROTO_EXECUTION_V1","AVANTIQO_ROTO_MATTE_AUTHORITY_V1"]},
  {id:"LAYERED_COMPOSITING",prepaid:true,visual:true,contracts:["AVANTIQO_LAYERED_COMPOSITING_RENDER_V1"]},
  {id:"LENS_SENSOR_OPTICS",prepaid:true,visual:true,contracts:["AVANTIQO_LENS_SENSOR_PROFILE_V1","CREATIVE_OPTICAL_FINISHING_V1"]},
  {id:"COLOR_DI",prepaid:true,visual:true,contracts:["AVANTIQO_COLOR_MANAGEMENT_AUTHORITY_V1","AVANTIQO_COLOR_FINISHING_V1"]},
  {id:"EDITORIAL_PICTURE_LOCK",prepaid:true,visual:true,contracts:["CREATIVE_DIRECTED_EDIT_TIMELINE_V1","CREATIVE_EDIT_PREPARATION_V1"]},
  {id:"RENDER_FARM",prepaid:true,visual:false,contracts:["AVANTIQO_RENDER_FARM_V1","AVANTIQO_RENDER_FARM_EXECUTION_V1"]},
  {id:"PRODUCTION_STAGING",prepaid:true,visual:false,contracts:["AVANTIQO_PRODUCTION_STAGING_V1"]},
  {id:"TEMPORAL_4K_UPSCALE",prepaid:true,visual:true,contracts:["AVANTIQO_TEMPORAL_SUPER_RESOLUTION_V1"]},
  {id:"AUDIO_POST_MASTER",prepaid:true,visual:false,contracts:["AVANTIQO_AUDIO_POST_MASTER_V1"]},
  {id:"VIDEO_GENERATION_1080",prepaid:false,visual:true,contracts:["AVANTIQO_VIDEO_ENGINE_V1"]},
]);
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function normalizeEvidence(raw={}){return{engine_id:text(raw.engine_id).toUpperCase(),implementation_contracts:list(raw.implementation_contracts).map(text),technical_proof_passed:raw.technical_proof_passed===true,technical_proof_id:text(raw.technical_proof_id)||null,visual_proof_passed:raw.visual_proof_passed===true,visual_proof_id:text(raw.visual_proof_id)||null,proof_asset_node_id:text(raw.proof_asset_node_id)||null,proof_checksum:text(raw.proof_checksum)||null,provider_calls_performed:raw.provider_calls_performed===true,verified_at:text(raw.verified_at)||null,notes:text(raw.notes)||null};}
export function certifyCinemaEngines({evidence=[]}={}){const byId=new Map(list(evidence).map(e=>{const n=normalizeEvidence(e);return[n.engine_id,n];}));const results=ENGINES.map(spec=>{const ev=byId.get(spec.id)||normalizeEvidence({engine_id:spec.id});const contractsOk=spec.contracts.every(c=>ev.implementation_contracts.includes(c));const technical=contractsOk&&ev.technical_proof_passed===true;const visual=!spec.visual||ev.visual_proof_passed===true;const passed=technical&&visual;const blockers=[];if(!contractsOk)blockers.push("IMPLEMENTATION_CONTRACT_EVIDENCE_REQUIRED");if(!ev.technical_proof_passed)blockers.push("TECHNICAL_PROOF_REQUIRED");if(spec.visual&&!ev.visual_proof_passed)blockers.push("VISUAL_PROOF_REQUIRED");return{...spec,evidence:ev,contracts_ok:contractsOk,technical_passed:technical,visual_passed:visual,passed,blockers};});const prepaid=results.filter(r=>r.prepaid);const infrastructureReady=prepaid.every(r=>r.passed);const productionCertified=results.every(r=>r.passed);const body={contract:AVANTIQO_CINEMA_ENGINE_CERTIFICATION_CONTRACT,engines:results,infrastructure_ready_for_paid_media_proof:infrastructureReady,paid_media_proof_unlocked:infrastructureReady,production_certified:productionCertified,status:productionCertified?"PRODUCTION_CERTIFIED":infrastructureReady?"READY_FOR_CONTROLLED_PAID_MEDIA_PROOF":"BLOCKED",blocked_engine_ids:results.filter(r=>!r.passed).map(r=>r.id),policy:{paid_media_generation_before_infrastructure_certification_forbidden:true,technical_tests_do_not_substitute_for_visual_proof:true,visual_proof_requires_durable_asset_or_review_id:true,production_unlock_requires_all_critical_engines:true,provider_spend_does_not_increase_authority:true}};return{...body,certification_hash:hash(body)};}
export const CreativeCinemaEngineCertificationRuntime=Object.freeze({contract:AVANTIQO_CINEMA_ENGINE_CERTIFICATION_CONTRACT,engine_specs:ENGINES,certify:certifyCinemaEngines});
