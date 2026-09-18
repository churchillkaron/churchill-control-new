import crypto from "node:crypto";

export const AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_CONTRACT="AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_V1";
export const AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_SEAL_CONTRACT="AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_SEAL_V1";
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
export function evaluateCinematicMotionDesign({plan={},render={}}={}){
  const blockers=[];
  if(text(plan.contract)!=="AVANTIQO_CINEMATIC_MOTION_DESIGN_V1")blockers.push("CINEMATIC_MOTION_PLAN_CONTRACT_REQUIRED");
  if(plan.status!=="READY")blockers.push("CINEMATIC_MOTION_PLAN_READY_REQUIRED");
  if(text(render.contract)!=="AVANTIQO_CINEMATIC_MOTION_DESIGN_RENDER_V1")blockers.push("CINEMATIC_MOTION_RENDER_CONTRACT_REQUIRED");
  if(render.world_space_rendered!==true)blockers.push("CINEMATIC_MOTION_WORLD_SPACE_RENDER_REQUIRED");
  if(render.provider_calls_performed!==false)blockers.push("CINEMATIC_MOTION_OWNED_RENDER_REQUIRED");
  if(!text(render.plan_contract_hash)||text(render.plan_contract_hash)!==text(plan.contract_hash))blockers.push("CINEMATIC_MOTION_PLAN_HASH_MISMATCH");
  if(!list(plan.events).length)blockers.push("CINEMATIC_MOTION_EVENTS_REQUIRED");
  for(const event of list(plan.events)){
    if(!text(event.governing_idea))blockers.push(`CINEMATIC_MOTION_GOVERNING_IDEA_REQUIRED:${event.event_id}`);
    if(!text(event.physical_medium))blockers.push(`CINEMATIC_MOTION_PHYSICAL_MEDIUM_REQUIRED:${event.event_id}`);
    if(!text(event.camera_relationship))blockers.push(`CINEMATIC_MOTION_CAMERA_RELATIONSHIP_REQUIRED:${event.event_id}`);
    if(!text(event.material_behavior))blockers.push(`CINEMATIC_MOTION_MATERIAL_BEHAVIOR_REQUIRED:${event.event_id}`);
    if(!text(event.transition_causality))blockers.push(`CINEMATIC_MOTION_TRANSITION_CAUSALITY_REQUIRED:${event.event_id}`);
    if(!list(event.sound_events).length)blockers.push(`CINEMATIC_MOTION_SOUND_EVENT_REQUIRED:${event.event_id}`);
  }
  if(render.exact_brand_lock_required===true&&render.brand_lock_applied!==true)blockers.push("CINEMATIC_MOTION_EXACT_BRAND_LOCK_REQUIRED");
  if(render.generated_logo_pixels_used!==false)blockers.push("CINEMATIC_MOTION_GENERATED_LOGO_FORBIDDEN");
  const checks={world_space:render.world_space_rendered===true,owned_render:render.provider_calls_performed===false,plan_hash_match:text(render.plan_contract_hash)===text(plan.contract_hash),sound_picture_hooks:list(render.sound_events).length>=list(plan.events).length,exact_brand_lock:render.exact_brand_lock_required!==true||render.brand_lock_applied===true,generated_logo_forbidden:render.generated_logo_pixels_used===false};
  return{contract:AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_CONTRACT,passed:blockers.length===0,blockers,checks,seal_hash:blockers.length?null:hash({plan_hash:plan.contract_hash,render_identity:render.render_identity,checks})};
}
export const CreativeCinematicMotionDesignQualityRuntime=Object.freeze({contract:AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_CONTRACT,seal_contract:AVANTIQO_CINEMATIC_MOTION_DESIGN_QC_SEAL_CONTRACT,evaluate:evaluateCinematicMotionDesign});
