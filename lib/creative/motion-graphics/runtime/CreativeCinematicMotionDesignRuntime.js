import crypto from "node:crypto";

export const AVANTIQO_CINEMATIC_MOTION_DESIGN_CONTRACT="AVANTIQO_CINEMATIC_MOTION_DESIGN_V1";

const EVENT_TYPES=new Set([
  "WORLD_SPACE_TYPOGRAPHY",
  "PROCEDURAL_ASSEMBLY",
  "MATERIAL_TRANSFORMATION",
  "LOGO_TRANSFORMATION",
  "PARTICLE_MORPH",
  "TECHNICAL_REVEAL",
  "TRANSITION_PHYSICS",
  "WORLD_SPACE_GRAPHIC",
]);
const SHALLOW_PRIMARY=new Set(["FADE","SLIDE","SCALE","ZOOM","GLOW","GENERIC_PARTICLES","LIGHT_SWEEP"]);
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v,n=10000){return String(v??"").trim().slice(0,n);}
function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function vec(v,f=[0,0,0]){return Array.isArray(v)&&v.length>=3?v.slice(0,3).map((x,i)=>finite(x,f[i])):f;}
function normalizeSoundEvent(raw={},index=0){return{event_id:text(raw.event_id||raw.id||`sound-${index+1}`,200),frame:Math.max(1,Math.round(finite(raw.frame,1))),role:text(raw.role||raw.type||"IMPACT",100).toUpperCase(),physical_source:text(raw.physical_source||raw.source,500),intensity:Math.max(0,Math.min(1,finite(raw.intensity,.7))),spatial_origin:vec(raw.spatial_origin||raw.position,[0,0,0])};}
function normalizeEvent(raw={},index=0){
  const r=object(raw);const type=text(r.type||r.kind,100).toUpperCase();const start=Math.max(1,Math.round(finite(r.start_frame,1)));const end=Math.max(start+1,Math.round(finite(r.end_frame,start+48)));
  return{
    event_id:text(r.event_id||r.id||`cinematic-motion-${index+1}`,200),type,start_frame:start,end_frame:end,
    governing_idea:text(r.governing_idea||r.visual_idea,1200),physical_medium:text(r.physical_medium||r.medium,600),
    world_space:r.world_space!==false,
    integration_mode:text(r.integration_mode||"SOURCE_FREE_CGI",80).toUpperCase(),
    integration_fidelity:text(r.integration_fidelity||(text(r.integration_mode).toUpperCase()==="SOURCE_WORLD_INTEGRATED"?"TRACKED_WORLD_3D":"SOURCE_FREE"),80).toUpperCase(),
    camera_relationship:text(r.camera_relationship,800),material_behavior:text(r.material_behavior,1200),
    camera_solution_asset_node_id:text(r.camera_solution_asset_node_id,500)||null,
    matchmove_asset_node_id:text(r.matchmove_asset_node_id,500)||null,
    depth_asset_node_id:text(r.depth_asset_node_id,500)||null,
    material_map_asset_node_id:text(r.material_map_asset_node_id,500)||null,
    transition_causality:text(r.transition_causality||r.causality,1200),story_function:text(r.story_function||r.purpose,800),
    exact_text:text(r.exact_text||r.text,2000)||null,font_asset_node_id:text(r.font_asset_node_id,500)||null,exact_font_required:r.exact_font_required!==false,logo_asset_node_id:text(r.logo_asset_node_id,500)||null,
    primary_mechanic:text(r.primary_mechanic||r.animation,100).toUpperCase(),
    position:vec(r.position,[0,0,0]),rotation:vec(r.rotation,[0,0,0]),scale:vec(r.scale,[1,1,1]),
    material:{start:text(r.material?.start||r.material_start||"MATTE_DARK",100).toUpperCase(),end:text(r.material?.end||r.material_end||"POLISHED_METAL",100).toUpperCase(),metallic_start:finite(r.material?.metallic_start,0),metallic_end:finite(r.material?.metallic_end,.8),roughness_start:finite(r.material?.roughness_start,.55),roughness_end:finite(r.material?.roughness_end,.16),emission_start:finite(r.material?.emission_start,0),emission_end:finite(r.material?.emission_end,0)},
    procedural:{count:Math.max(1,Math.min(1000,Math.round(finite(r.procedural?.count,32)))),radius:Math.max(.01,Math.min(20,finite(r.procedural?.radius,1.4))),seed:Math.round(finite(r.procedural?.seed,1701)),assembly_axis:vec(r.procedural?.assembly_axis,[0,0,1])},
    sound_events:list(r.sound_events).map(normalizeSoundEvent),
    final_brand_lock:r.final_brand_lock===true,
  };
}
function blockersFor(event,{flagship=true}={}){
  const b=[];
  if(!EVENT_TYPES.has(event.type))b.push(`CINEMATIC_MOTION_TYPE_UNSUPPORTED:${event.event_id}:${event.type}`);
  if(!event.governing_idea)b.push(`CINEMATIC_MOTION_GOVERNING_IDEA_REQUIRED:${event.event_id}`);
  if(!event.physical_medium)b.push(`CINEMATIC_MOTION_PHYSICAL_MEDIUM_REQUIRED:${event.event_id}`);
  if(event.world_space!==true)b.push(`CINEMATIC_MOTION_WORLD_SPACE_REQUIRED:${event.event_id}`);
  if(!event.camera_relationship)b.push(`CINEMATIC_MOTION_CAMERA_RELATIONSHIP_REQUIRED:${event.event_id}`);
  if(event.integration_mode==="SOURCE_WORLD_INTEGRATED"&&event.integration_fidelity==="TRACKED_WORLD_3D"&&(!event.matchmove_asset_node_id||!event.depth_asset_node_id))b.push(`CINEMATIC_MOTION_3D_MATCHMOVE_BINDING_REQUIRED:${event.event_id}`);
  if(event.integration_mode==="SOURCE_WORLD_INTEGRATED"&&event.integration_fidelity==="SINGLE_VIEW_CONSTRAINED"&&(!event.camera_solution_asset_node_id||!event.depth_asset_node_id))b.push(`CINEMATIC_MOTION_SINGLE_VIEW_BINDING_REQUIRED:${event.event_id}`);
  if(event.integration_mode==="SOURCE_WORLD_INTEGRATED"&&!['TRACKED_WORLD_3D','SINGLE_VIEW_CONSTRAINED'].includes(event.integration_fidelity))b.push(`CINEMATIC_MOTION_INTEGRATION_FIDELITY_INVALID:${event.event_id}`);
  if(!event.material_behavior)b.push(`CINEMATIC_MOTION_MATERIAL_BEHAVIOR_REQUIRED:${event.event_id}`);
  if(!event.transition_causality)b.push(`CINEMATIC_MOTION_TRANSITION_CAUSALITY_REQUIRED:${event.event_id}`);
  if(!event.story_function)b.push(`CINEMATIC_MOTION_STORY_FUNCTION_REQUIRED:${event.event_id}`);
  if(flagship&&SHALLOW_PRIMARY.has(event.primary_mechanic))b.push(`CINEMATIC_MOTION_TEMPLATE_PRIMARY_FORBIDDEN:${event.event_id}:${event.primary_mechanic}`);
  if(event.type==="WORLD_SPACE_TYPOGRAPHY"&&!event.exact_text)b.push(`CINEMATIC_MOTION_EXACT_TEXT_REQUIRED:${event.event_id}`);
  if(event.type==="WORLD_SPACE_TYPOGRAPHY"&&event.exact_font_required===true&&!event.font_asset_node_id)b.push(`CINEMATIC_MOTION_EXACT_FONT_ASSET_REQUIRED:${event.event_id}`);
  if(event.type==="LOGO_TRANSFORMATION"&&(!event.logo_asset_node_id||event.final_brand_lock!==true))b.push(`CINEMATIC_MOTION_EXACT_LOGO_FINAL_STATE_REQUIRED:${event.event_id}`);
  if(flagship&&!event.sound_events.length)b.push(`CINEMATIC_MOTION_SOUND_EVENT_REQUIRED:${event.event_id}`);
  return b;
}
export function planCinematicMotionDesign({events=[],width=1920,height=1080,fps=24,frames=null,flagship=true}={}){
  const normalized=list(events).map(normalizeEvent);const durationFrames=frames||Math.max(1,...normalized.map(e=>e.end_frame));const blockers=[...new Set(normalized.flatMap(e=>blockersFor(e,{flagship})))];
  const base={contract:AVANTIQO_CINEMATIC_MOTION_DESIGN_CONTRACT,version:1,flagship:flagship===true,provider_neutral:true,width:Math.max(320,Math.round(finite(width,1920))),height:Math.max(180,Math.round(finite(height,1080))),fps:Math.max(12,Math.round(finite(fps,24))),frames:durationFrames,events:normalized,policy:{template_motion_primary_forbidden:true,generic_particles_without_story_causality_forbidden:true,world_space_required:true,material_physics_required:true,camera_relationship_required:true,source_world_requires_certified_camera_and_depth:true,sound_picture_event_required:true,exact_brand_logo_final_state_required:true,consumer_ai_equivalent_rejected:true,canva_after_effects_template_equivalent_rejected:true}};
  return{...base,status:blockers.length?"BLOCKED":"READY",blockers,contract_hash:hash(base)};
}
export const CreativeCinematicMotionDesignRuntime=Object.freeze({contract:AVANTIQO_CINEMATIC_MOTION_DESIGN_CONTRACT,event_types:Object.freeze([...EVENT_TYPES]),plan:planCinematicMotionDesign});
