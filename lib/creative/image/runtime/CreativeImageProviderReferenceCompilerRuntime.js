export const CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT = "CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_V1";
export const CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT = 10;

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function uniqueByUrl(items=[]){
  const seen=new Set();const out=[];
  for(const item of list(items)){
    const url=text(item.url);if(!url||seen.has(url))continue;
    seen.add(url);out.push(item);
  }
  return out;
}
function cameraText(task={}){
  return [
    task.input?.requirements?.camera?.framing,
    task.input?.requirements?.camera?.angle,
    task.input?.requirements?.camera?.lens_intent,
    task.input?.requirements?.camera?.movement_path,
    task.input?.requirements?.purpose,
    task.input?.requirements?.action,
  ].map(text).join(" ").toLowerCase();
}
function preferredViewRoles(prefix,task={}){
  const s=cameraText(task);
  if(/rear|behind|back/.test(s)) return [prefix+"_REAR",prefix+"_LEFT_THREE_QUARTER"];
  if(/profile|side|lateral|oblique/.test(s)) return [prefix+"_RIGHT_PROFILE",prefix+"_LEFT_THREE_QUARTER"];
  if(/close|detail|face|macro|insert/.test(s)) return [prefix+"_DETAIL",prefix+"_FRONT"];
  return [prefix+"_LEFT_THREE_QUARTER",prefix+"_FRONT"];
}
function materialScore(role="",task={}){
  const r=text(role).toUpperCase();
  const s=[
    task.input?.requirements?.subject,
    task.input?.requirements?.action,
    task.input?.requirements?.purpose,
    JSON.stringify(task.input?.requirements?.environmental_continuity_state||{}),
    JSON.stringify(task.input?.requirements?.lighting||{}),
  ].map(text).join(" ").toLowerCase();
  let score=0;
  const checks=[
    ["WET_SKIN",/skin|face|hand|person|human/],
    ["WET_FABRIC",/fabric|cloth|wardrobe|runner|person|human/],
    ["WET_BARK",/bark|tree|forest|branch/],
    ["BARK",/bark|tree|forest|branch/],
    ["WET_MUD_GROUND",/mud|ground|foot|boot|slip|stumble/],
    ["GROUND",/ground|foot|boot|terrain/],
    ["WET_METAL",/drone|metal|vehicle|machine|threat/],
    ["METAL",/drone|metal|vehicle|machine|threat/],
    ["WET_GLASS",/glass|window|lens|visor|headlamp/],
    ["GLASS",/glass|window|lens|visor|headlamp/],
    ["SEARCHLIGHT_ATMOSPHERE_INTERACTION",/search.?light|beam|fog|mist|rain/],
  ];
  for(const [key,re] of checks) if(r.includes(key)&&re.test(s)) score+=10;
  if(/RAIN|WET/.test(r)&&/rain|wet|storm|water/.test(s)) score+=5;
  return score;
}

export function compileImageProviderReferences({task={},source_assets=[],max_assets=CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT}={}){
  const all=uniqueByUrl(source_assets);
  const byRole=new Map(all.map(item=>[text(item.role).toUpperCase(),item]));
  const selected=[];
  const add=(item,reason)=>{if(item&&!selected.some(x=>x.url===item.url))selected.push({...item,provider_reference_reason:reason});};
  add(byRole.get("IMAGE_STUDIO_SELECTED_HERO_FRAME"),"PRIMARY_HERO");
  add(byRole.get("IMAGE_STUDIO_CONTINUITY_REFERENCE"),"CONTINUITY");
  add(byRole.get("IMAGE_STUDIO_PERFORMANCE_REFERENCE"),"PERFORMANCE");
  add(byRole.get("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE"),"PHYSICAL_CONTACT");
  for(const role of preferredViewRoles("IMAGE_STUDIO_CHARACTER",task)) add(byRole.get(role),"CHARACTER_VIEW_MATCH");
  for(const role of preferredViewRoles("IMAGE_STUDIO_THREAT",task)) add(byRole.get(role),"THREAT_VIEW_MATCH");
  const materials=all
    .filter(item=>text(item.role).toUpperCase().startsWith("IMAGE_STUDIO_MATERIAL_TRUTH_"))
    .sort((a,b)=>materialScore(b.role,task)-materialScore(a.role,task));
  for(const item of materials) {
    if(selected.length>=max_assets)break;
    add(item,"MATERIAL_RELEVANCE");
  }
  for(const item of all){
    if(selected.length>=max_assets)break;
    add(item,"FALLBACK_AUTHORITY");
  }
  const compiled=selected.slice(0,Math.max(1,Math.min(12,Number(max_assets)||CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT)));
  return {
    contract:CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT,
    max_assets:Math.max(1,Math.min(12,Number(max_assets)||CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT)),
    source_asset_count:all.length,
    compiled_asset_count:compiled.length,
    truncated:compiled.length<all.length,
    source_assets:compiled,
    omitted_asset_node_ids:all.filter(item=>!compiled.some(row=>row.url===item.url)).map(item=>item.asset_node_id).filter(Boolean),
    provider_transport_safe:compiled.length<=12,
    provider_neutral:true,
    zero_provider_calls:true,
  };
}
export const CreativeImageProviderReferenceCompilerRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT,
  limit:CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT,
  compile:compileImageProviderReferences,
});
