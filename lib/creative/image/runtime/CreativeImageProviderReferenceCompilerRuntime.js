export const CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT = "CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_V1";
export const CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT = 10;

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function referenceKey(item={}){
  if(typeof item==="string") return text(item);
  if(!item||typeof item!=="object") return "";
  return text(
    item.url ||
    item.file_url ||
    item.fileUrl ||
    item.storage_reference ||
    item.storageReference ||
    item.asset_id ||
    item.assetId ||
    item.id ||
    item.asset_node_id
  );
}
function uniqueByReference(items=[]){
  const byKey=new Map();
  for(const raw of list(items)){
    const item=typeof raw==="string"?{url:raw}:raw;
    const key=referenceKey(item);if(!key)continue;
    const prior=byKey.get(key);
    const role=text(item.role).toUpperCase();
    if(!prior){
      byKey.set(key,{
        ...item,
        role_aliases:role?[role]:[],
        aliased_asset_node_ids:[item.asset_node_id].filter(Boolean),
      });
      continue;
    }
    byKey.set(key,{
      ...prior,
      role_aliases:[...new Set([...list(prior.role_aliases),role].filter(Boolean))],
      aliased_asset_node_ids:[
        ...new Set([
          ...list(prior.aliased_asset_node_ids),
          item.asset_node_id,
        ].filter(Boolean)),
      ],
    });
  }
  return [...byKey.values()];
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
  const all=uniqueByReference(source_assets);
  const byRole=new Map(all.map(item=>[text(item.role).toUpperCase(),item]));
  const selected=[];
  const add=(item,reason)=>{
    const key=referenceKey(item);
    if(item&&key&&!selected.some(x=>referenceKey(x)===key)){
      selected.push({...item,provider_reference_reason:reason});
    }
  };
  add(byRole.get("IMAGE_STUDIO_SELECTED_HERO_FRAME"),"PRIMARY_HERO");
  add(byRole.get("IMAGE_STUDIO_CONTINUITY_REFERENCE"),"CONTINUITY");
  add(byRole.get("IMAGE_STUDIO_PERFORMANCE_REFERENCE"),"PERFORMANCE");
  add(byRole.get("IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE"),"PHYSICAL_CONTACT");

  const characterRoles=preferredViewRoles("IMAGE_STUDIO_CHARACTER",task);
  const threatRoles=preferredViewRoles("IMAGE_STUDIO_THREAT",task);
  add(byRole.get(characterRoles[0]),"CHARACTER_PRIMARY_VIEW_MATCH");
  add(byRole.get(threatRoles[0]),"THREAT_PRIMARY_VIEW_MATCH");

  const endpointReferences=all.filter(item=>
    ["CLOSING_KEYFRAME_REFERENCE","APPROVED_IDENTITY_KEYFRAME","IDENTITY_KEYFRAME_REFERENCE"]
      .includes(text(item.role).toUpperCase())
  );
  for(const item of endpointReferences.slice(0,2)){
    if(selected.length>=max_assets)break;
    add(item,"ENDPOINT_OR_IDENTITY_REFERENCE");
  }

  const materials=all
    .filter(item=>text(item.role).toUpperCase().startsWith("IMAGE_STUDIO_MATERIAL_TRUTH_"))
    .sort((a,b)=>materialScore(b.role,task)-materialScore(a.role,task));
  if(materials[0]) add(materials[0],"MATERIAL_PRIMARY_RELEVANCE");

  add(byRole.get(characterRoles[1]),"CHARACTER_SECONDARY_VIEW_MATCH");
  add(byRole.get(threatRoles[1]),"THREAT_SECONDARY_VIEW_MATCH");

  for(const item of endpointReferences.slice(2)){
    if(selected.length>=max_assets)break;
    add(item,"ENDPOINT_OR_IDENTITY_REFERENCE");
  }
  for(const item of materials.slice(1)) {
    if(selected.length>=max_assets)break;
    add(item,"MATERIAL_RELEVANCE");
  }
  for(const item of all){
    if(selected.length>=max_assets)break;
    add(item,"FALLBACK_AUTHORITY");
  }
  const effectiveLimit=Math.max(
    1,
    Math.min(10,Number(max_assets)||CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT),
  );
  const compiled=selected.slice(0,effectiveLimit);
  const mandatoryRoles=[
    "IMAGE_STUDIO_SELECTED_HERO_FRAME",
    ...(all.some(item=>text(item.role).toUpperCase()==="IMAGE_STUDIO_CONTINUITY_REFERENCE")
      ?["IMAGE_STUDIO_CONTINUITY_REFERENCE"] : []),
    ...(all.some(item=>text(item.role).toUpperCase()==="IMAGE_STUDIO_PERFORMANCE_REFERENCE")
      ?["IMAGE_STUDIO_PERFORMANCE_REFERENCE"] : []),
    ...(all.some(item=>text(item.role).toUpperCase()==="IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE")
      ?["IMAGE_STUDIO_CONTACT_DETAIL_REFERENCE"] : []),
  ];
  const rolePresent=(role)=>compiled.some(item=>
    text(item.role).toUpperCase()===role ||
    list(item.role_aliases).includes(role)
  );
  const missingMandatoryRoles=mandatoryRoles.filter(role=>!rolePresent(role));
  const mandatoryGroups=[
    ...(all.some(item=>text(item.role).toUpperCase().startsWith("IMAGE_STUDIO_CHARACTER_"))
      ?[{group:"CHARACTER_GEOMETRY",prefix:"IMAGE_STUDIO_CHARACTER_"}] : []),
    ...(all.some(item=>text(item.role).toUpperCase().startsWith("IMAGE_STUDIO_THREAT_"))
      ?[{group:"THREAT_GEOMETRY",prefix:"IMAGE_STUDIO_THREAT_"}] : []),
    ...(all.some(item=>text(item.role).toUpperCase().startsWith("IMAGE_STUDIO_MATERIAL_TRUTH_"))
      ?[{group:"MATERIAL_TRUTH",prefix:"IMAGE_STUDIO_MATERIAL_TRUTH_"}] : []),
  ];
  const missingMandatoryGroups=mandatoryGroups
    .filter(({prefix})=>!compiled.some(item=>
      text(item.role).toUpperCase().startsWith(prefix) ||
      list(item.role_aliases).some(alias=>text(alias).toUpperCase().startsWith(prefix))
    ))
    .map(({group})=>group);
  return {
    contract:CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT,
    max_assets:effectiveLimit,
    provider_total_reference_limit:12,
    native_video_reference_reserve:2,
    source_asset_count:all.length,
    compiled_asset_count:compiled.length,
    truncated:compiled.length<all.length,
    source_assets:compiled,
    mandatory_roles:mandatoryRoles,
    mandatory_groups:mandatoryGroups.map(item=>item.group),
    missing_mandatory_roles:missingMandatoryRoles,
    missing_mandatory_groups:missingMandatoryGroups,
    omitted_asset_node_ids:all.filter(item=>!compiled.some(row=>referenceKey(row)===referenceKey(item))).map(item=>item.asset_node_id).filter(Boolean),
    omitted_references:all
      .filter(item=>!compiled.some(row=>referenceKey(row)===referenceKey(item)))
      .map(item=>({
        asset_node_id:item.asset_node_id||null,
        role:item.role||null,
        role_aliases:list(item.role_aliases),
        reason:"PROVIDER_REFERENCE_BUDGET",
      })),
    provider_transport_safe:
      compiled.length<=effectiveLimit &&
      missingMandatoryRoles.length===0 &&
      missingMandatoryGroups.length===0,
    provider_neutral:true,
    zero_provider_calls:true,
  };
}
export const CreativeImageProviderReferenceCompilerRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_PROVIDER_REFERENCE_COMPILER_CONTRACT,
  limit:CREATIVE_IMAGE_PROVIDER_REFERENCE_LIMIT,
  compile:compileImageProviderReferences,
});
