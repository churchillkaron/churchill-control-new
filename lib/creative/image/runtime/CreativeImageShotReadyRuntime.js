import crypto from "node:crypto";

export const CREATIVE_IMAGE_SHOT_READY_CONTRACT = "CREATIVE_IMAGE_SHOT_READY_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function physicalShot(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.environmental_continuity_state||{}),JSON.stringify(r.pursuit_spatial_choreography||{})].map(text).join(" ").toLowerCase();
  return /person|human|runner|drone|vehicle|rain|forest|mud|ground|impact|contact|pursu|hunt|threat|search.?light|movement|run|walk|jump|fall/.test(s);
}
function threatShot(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.pursuit_spatial_choreography||{})].map(text).join(" ").toLowerCase();
  return /drone|threat|pursu|hunt|predator|search beam/.test(s);
}
export function evaluateImageShotReady({task={},previsualization_authority={},production_package={}}={}){
  const r=object(task.input?.requirements);
  const failures=[];
  if(previsualization_authority?.passed!==true) failures.push("SHOT_READY_PREVIS_AUTHORITY_REQUIRED");
  if(production_package?.passed!==true) failures.push("SHOT_READY_PRODUCTION_PACKAGE_REQUIRED");
  if(!text(production_package?.production_package_digest)) failures.push("SHOT_READY_PACKAGE_DIGEST_REQUIRED");
  if(!text(production_package?.camera_authority?.authority_hash)) failures.push("SHOT_READY_CAMERA_AUTHORITY_HASH_REQUIRED");
  if(!production_package?.hero?.asset_node_id) failures.push("SHOT_READY_HERO_ASSET_REQUIRED");
  if(!production_package?.continuity?.asset_node_id) failures.push("SHOT_READY_CONTINUITY_ASSET_REQUIRED");
  if(!text(r.previsualization_blueprint?.blueprint_digest)) failures.push("SHOT_READY_BLUEPRINT_DIGEST_REQUIRED");
  if(physicalShot(r)){
    if(!Object.keys(object(r.virtual_camera_state)).length) failures.push("SHOT_READY_VIRTUAL_CAMERA_REQUIRED");
    if(!Object.keys(object(r.environmental_continuity_state)).length) failures.push("SHOT_READY_ENVIRONMENT_CONTINUITY_REQUIRED");
    if(!Object.keys(object(r.performance_direction||r.performance)).length&&list(r.actors).length) failures.push("SHOT_READY_PERFORMANCE_DIRECTION_REQUIRED");
  }
  if(threatShot(r)){
    if(!Object.keys(object(r.pursuit_spatial_choreography)).length) failures.push("SHOT_READY_PURSUIT_SPATIAL_CHOREOGRAPHY_REQUIRED");
    if(!Object.keys(object(r.editorial_causality)).length) failures.push("SHOT_READY_EDITORIAL_CAUSALITY_REQUIRED");
  }
  const strategy=object(r.generation_strategy||task.metadata?.generation_strategy);
  if(["SHARED_KEYFRAME_SEQUENCE","MULTIPASS_COMPLEX"].includes(text(strategy.mode).toUpperCase())){
    if(!text(strategy.shared_state_group_id)) failures.push("SHOT_READY_SHARED_STATE_GROUP_REQUIRED");
  }
  const evidence={
    blueprint_digest:r.previsualization_blueprint?.blueprint_digest||null,
    previsualization_authority_digest:previsualization_authority?.previsualization_authority_digest||null,
    production_package_digest:production_package?.production_package_digest||null,
    camera_authority_hash:production_package?.camera_authority?.authority_hash||null,
    hero_asset_node_id:production_package?.hero?.asset_node_id||null,
    continuity_asset_node_id:production_package?.continuity?.asset_node_id||null,
    character_multiview_count:list(production_package?.character_multiview_asset_node_ids).length,
    threat_multiview_count:list(production_package?.threat_multiview_asset_node_ids).length,
    material_truth_count:list(production_package?.material_truth_assets).length,
    generation_strategy_mode:strategy.mode||null,
    shared_state_group_id:strategy.shared_state_group_id||null,
  };
  return Object.freeze({
    contract:CREATIVE_IMAGE_SHOT_READY_CONTRACT,
    passed:failures.length===0,
    failures:[...new Set(failures)],
    evidence,
    shot_ready_digest:hash({contract:CREATIVE_IMAGE_SHOT_READY_CONTRACT,evidence}),
    zero_provider_calls:true,
    zero_media_generation:true,
  });
}
export const CreativeImageShotReadyRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_SHOT_READY_CONTRACT,
  evaluate:evaluateImageShotReady,
});
