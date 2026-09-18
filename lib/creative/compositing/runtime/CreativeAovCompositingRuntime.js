import crypto from "node:crypto";

export const AVANTIQO_AOV_COMPOSITING_CONTRACT="AVANTIQO_AOV_COMPOSITING_V1";
const REQUIRED=new Set(["COMBINED","DEPTH","NORMAL","VECTOR"]);
const OPTIONAL=new Set(["AO","DIFFUSE_DIRECT","DIFFUSE_INDIRECT","GLOSSY_DIRECT","GLOSSY_INDIRECT","TRANSMISSION_DIRECT","TRANSMISSION_INDIRECT","EMISSION","ENVIRONMENT","SHADOW","CRYPTOMATTE_OBJECT","CRYPTOMATTE_MATERIAL"]);
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=1,min=0,max=100){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?n:f));}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
export function authorAovComposite({shot_id,aovs=[],camera_solution_asset_node_id=null,depth_authority_asset_node_id=null,base_plate_asset_node_id=null,scene_linear=true}={}){
  const normalized=list(aovs).map((a,i)=>({aov_id:text(a.aov_id||a.id||`aov-${i+1}`),role:text(a.role||a.aov_role).toUpperCase(),asset_node_id:text(a.asset_node_id)||null,weight:finite(a.weight,1,0,10),enabled:a.enabled!==false,operation:text(a.operation||"NATIVE").toUpperCase(),source_checksum:text(a.source_checksum)||null})).filter(a=>a.enabled);
  const roles=new Set(normalized.map(a=>a.role));const blockers=[];
  for(const role of REQUIRED)if(!roles.has(role))blockers.push(`AOV_REQUIRED:${role}`);
  for(const a of normalized)if(!REQUIRED.has(a.role)&&!OPTIONAL.has(a.role))blockers.push(`AOV_ROLE_UNSUPPORTED:${a.role}`);
  for(const a of normalized)if(!a.asset_node_id)blockers.push(`AOV_ASSET_REQUIRED:${a.role}`);
  if(!text(base_plate_asset_node_id))blockers.push("AOV_BASE_PLATE_REQUIRED");
  if(!text(camera_solution_asset_node_id))blockers.push("AOV_CAMERA_SOLUTION_REQUIRED");
  if(!text(depth_authority_asset_node_id))blockers.push("AOV_DEPTH_AUTHORITY_REQUIRED");
  if(scene_linear!==true)blockers.push("AOV_SCENE_LINEAR_REQUIRED");
  const body={contract:AVANTIQO_AOV_COMPOSITING_CONTRACT,shot_id:text(shot_id),base_plate_asset_node_id:text(base_plate_asset_node_id)||null,camera_solution_asset_node_id:text(camera_solution_asset_node_id)||null,depth_authority_asset_node_id:text(depth_authority_asset_node_id)||null,scene_linear:true,aovs:normalized,reconstruction_policy:{camera_match_required:true,depth_occlusion_required:true,motion_vector_blur_required:true,normal_based_relight_supported:true,cryptomatte_object_material_isolation_supported:true},light_integration_policy:{diffuse_and_specular_separate:true,shadow_density_adjustable:true,reflection_specular_adjustable:true,transmission_adjustable:true,emission_adjustable:true,ambient_occlusion_adjustable:true,beauty_flattening_before_integration_forbidden:true},color_policy:{scene_linear_composite_required:true,creative_grade_after_composite_only:true},render_policy:{deep_compositing_equivalent:false,aov_preservation_required:true,flatten_only_after_qc:true}};
  return{...body,status:blockers.length?"BLOCKED":"READY",blockers,contract_hash:hash(body)};
}
export const CreativeAovCompositingRuntime=Object.freeze({contract:AVANTIQO_AOV_COMPOSITING_CONTRACT,required_roles:Object.freeze([...REQUIRED]),optional_roles:Object.freeze([...OPTIONAL]),author:authorAovComposite});
