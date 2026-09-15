import crypto from "node:crypto";
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function list(v){return Array.isArray(v)?v.filter(Boolean):[]}
function text(v){if(v==null)return ""; if(typeof v==="object") return JSON.stringify(v); return String(v).trim()}
function normalizedText(v){return String(v??"").trim().toLowerCase().replace(/\s+/g," ")}
function normalizedKey(v){return String(v??"").trim().replace(/([a-z0-9])([A-Z])/g,"$1_$2").replaceAll("-","_").replace(/\s+/g,"_").toLowerCase()}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return typeof v==="string"?normalizedText(v):v;return Object.fromEntries(Object.keys(v).sort().map(k=>[normalizedKey(k),stable(v[k])]))}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex")}
function first(...v){for(const x of v){const t=text(x); if(t)return t} return ""}
export function buildCinematicExecutionContract({scene={},shot={},requirements={}}={}){
 const r=object(requirements), ctx=object(r.scene_context), dna=object(r.cinematic_dna||shot.cinematic_dna);
 const subject=first(r.subject,shot.subject,"authored subject");
 const location=object(r.location); const lighting=object(r.lighting); const design=object(r.production_design); const frame=object(r.frame_plan);
 const bible=Object.keys(object(r.continuity_bible)).length?object(r.continuity_bible):{
  world_identity:first(ctx.story_function,ctx.objective,r.purpose,subject),
  hero_subject_identity:subject,
  location_identity:first(location,ctx.location,"authored location"),
  lighting_state:first(lighting,ctx.visual_style?.lighting,r.mood,"authored motivated light"),
  spatial_map:first(design,ctx.visual_style?.composition,r.camera,"authored spatial composition"),
 };
 const beauty=Object.keys(object(r.beauty_system)).length?object(r.beauty_system):{
  visual_hierarchy:first(dna.visual_hierarchy,subject),
  negative_space:first(ctx.visual_style?.composition,"Preserve deliberate negative space around the primary subject."),
  depth_strategy:first(dna.depth_strategy,"Preserve authored foreground, midground and background separation."),
  light_strategy:first(dna.lighting_philosophy,lighting,"Use physically motivated light."),
  colour_strategy:first(ctx.visual_style?.color_palette,r.mood,"Preserve the authored colour and emotional state."),
  material_strategy:first(dna.material_behavior,design,"Preserve physically plausible material response."),
  lens_strategy:first(dna.camera_philosophy,r.camera,"Use the authored camera and lens intent only."),
 };
 const grammar=Object.keys(object(r.cinematic_grammar)).length?object(r.cinematic_grammar):{
  mystery_question:`What changes when ${subject} completes the authored action?`,
  withheld_information:first(ctx.story_state_before,ctx.transition_logic,"Withhold the larger meaning until the authored reveal."),
  recurring_motif:first(subject,dna.narrative_role,"authored visual motif"),
  transition_grammar:first(ctx.transition_logic,"Transition only through authored causal picture or sound logic."),
  payoff_frame:first(dna.iconic_frame?.target,frame.closing_frame,"Resolve on the authored changed story state."),
  reveal_ladder:[first(frame.opening_frame,"establish"),first(frame.progression,frame.progression_frames,"develop"),first(frame.closing_frame,dna.iconic_frame?.target,"payoff")],
 };
 const canonical={world_identity:text(bible.world_identity),hero_subject_identity:text(bible.hero_subject_identity),location_identity:text(bible.location_identity),lighting_state:text(bible.lighting_state),spatial_map:text(bible.spatial_map)};
 const lock=Object.keys(object(r.persistent_subject_lock)).length?object(r.persistent_subject_lock):{contract:"CREATIVE_PERSISTENT_SUBJECT_LOCK_V1",scene_id:shot.scene_id||r.scene_id||scene.id||null,lock_hash:hash(canonical),canonical,allowed_changes:list(bible.allowed_changes),same_scene_identity_replacement_forbidden:true,same_scene_location_replacement_forbidden:true,silent_geometry_change_forbidden:true,spatial_teleportation_forbidden:true};
 return {continuity_bible:bible,cinematic_grammar:grammar,beauty_system:beauty,persistent_subject_lock:lock,beauty_intent:first(r.beauty_intent,dna.visual_hierarchy,dna.composition),focal_path:first(r.focal_path,r.action,dna.visual_hierarchy),depth_layers:first(r.depth_layers,dna.depth_strategy),reveal_stage:first(r.reveal_stage,shot.reveal_stage,dna.iconic_frame?.required?"payoff":"setup"),mystery_function:first(r.mystery_function,shot.mystery_function,r.purpose,dna.narrative_role),inherited_world_state:first(r.inherited_world_state,shot.inherited_world_state,ctx.story_state_before,bible.world_identity)};
}
export const CreativeCinematicExecutionContractRuntime=Object.freeze({build:buildCinematicExecutionContract});
