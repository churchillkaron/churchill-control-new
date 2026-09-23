export const CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_CONTRACT =
  "CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_V1";
export const CREATIVE_IMAGE_GENERATION_REFERENCE_LIMIT = 10;

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}

function refKey(value){
  if(!value)return "";
  if(typeof value==="string")return text(value);
  if(typeof value!=="object")return "";
  return text(
    value.url ||
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.storage_reference ||
    value.storageReference ||
    value.asset_node_id ||
    value.assetNodeId ||
    value.asset_id ||
    value.assetId ||
    value.id
  );
}

function roleOf(value={}){
  return text(typeof value==="object"?value.role:"").toUpperCase();
}

function priority(value={}){
  const role=roleOf(value);
  if(/IDENTITY_ATLAS|IDENTITY_ANGLE/.test(role))return 0;
  if(/FOUNDATION_CHARACTER/.test(role))return 1;
  if(/FOUNDATION_THREAT/.test(role))return 2;
  if(/FOUNDATION_ENVIRONMENT/.test(role))return 3;
  if(/PRIMARY|SOURCE_AUTHORITY|AUTHENTIC_SOURCE/.test(role))return 4;
  if(/CHARACTER/.test(role))return 5;
  if(/THREAT/.test(role))return 6;
  if(/ENVIRONMENT|WORLD|LOOKFRAME/.test(role))return 7;
  if(/MATERIAL/.test(role))return 8;
  return 9;
}

function unique(values=[]){
  const map=new Map();
  for(const value of list(values)){
    const key=refKey(value);
    if(!key)continue;
    const role=roleOf(value);
    const prior=map.get(key);
    if(!prior){
      map.set(key,{
        ...(typeof value==="object"?value:{url:value}),
        role_aliases:role?[role]:[],
      });
      continue;
    }
    const preferred=priority(value)<priority(prior)?{
      ...(typeof value==="object"?value:{url:value}),
      role_aliases:list(prior.role_aliases),
    }:prior;
    map.set(key,{
      ...preferred,
      role_aliases:[
        ...new Set([
          ...list(prior.role_aliases),
          role,
        ].filter(Boolean)),
      ],
    });
  }
  return [...map.values()].sort((a,b)=>priority(a)-priority(b));
}

function semanticReserved(input={}){
  return unique([
    input.source,
    input.image,
    input.source_image,
    input.sourceImage,
    input.mask_image,
    input.maskImage,
  ]);
}

function imageGenerationTask(task={}){
  const capability=text(
    task.capability ||
    task.service_code ||
    task.service_id
  ).toLowerCase();
  const contract=text(task.metadata?.contract);
  const requirements=object(task.input?.requirements);
  const imageCapability=[
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
  ].includes(capability);
  const imageStudioLineage=
    contract.startsWith("CREATIVE_IMAGE_") ||
    Boolean(requirements.image_asset_authority) ||
    requirements.material_truth_reference?.physical_surface_authority===true ||
    task.metadata?.material_truth_reference===true ||
    task.metadata?.image_asset_multiview_task===true ||
    task.metadata?.image_asset_derivative_task===true ||
    task.metadata?.image_asset_localized_repair===true;
  return imageCapability&&imageStudioLineage;
}

function filterSelected(values=[],selectedKeys=new Set()){
  return list(values).filter(value=>selectedKeys.has(refKey(value)));
}

export function compileImageGenerationReferences({
  task={},
  max_references=CREATIVE_IMAGE_GENERATION_REFERENCE_LIMIT,
}={}){
  if(!imageGenerationTask(task)){
    return Object.freeze({
      contract:CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_CONTRACT,
      required:false,
      passed:true,
      provider_reference_limit:12,
      selected_reference_count:0,
      zero_provider_calls:true,
    });
  }
  const input=object(task.input);
  const reserved=semanticReserved(input);
  const reservedKeys=new Set(reserved.map(refKey).filter(Boolean));
  const all=unique([
    ...list(input.reference_images),
    ...list(input.reference_assets),
    ...list(input.source_assets),
    ...list(input.assets),
  ]).filter(value=>!reservedKeys.has(refKey(value)));

  const safeReferenceBudget=Math.max(
    0,
    Math.min(
      Number(max_references)||CREATIVE_IMAGE_GENERATION_REFERENCE_LIMIT,
      12-reserved.length,
    ),
  );
  const selected=all.slice(0,safeReferenceBudget);
  const selectedKeys=new Set(selected.map(refKey));
  const omitted=all.filter(value=>!selectedKeys.has(refKey(value)));
  const requirements=object(input.requirements);
  const foundation=object(requirements.image_foundation_authority);
  const requiredGroups=[
    ...(foundation.character_asset_node_id
      ?[{group:"FOUNDATION_CHARACTER",match:/FOUNDATION_CHARACTER/}] : []),
    ...(foundation.threat_asset_node_id
      ?[{group:"FOUNDATION_THREAT",match:/FOUNDATION_THREAT/}] : []),
    ...(foundation.environment_asset_node_id
      ?[{group:"FOUNDATION_ENVIRONMENT",match:/FOUNDATION_ENVIRONMENT/}] : []),
    ...(requirements.material_truth_reference?.physical_surface_authority===true
      ?[{group:"MATERIAL_TRUTH_SOURCE",match:/MATERIAL_TRUTH_SOURCE_/}] : []),
  ];
  const selectedRoles=(value)=>[
    roleOf(value),
    ...list(value?.role_aliases).map(alias=>text(alias).toUpperCase()),
  ];
  const missingRequiredGroups=requiredGroups
    .filter(({match})=>!selected.some(value=>
      selectedRoles(value).some(role=>match.test(role))
    ))
    .map(({group})=>group);

  const payload={
    contract:CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_CONTRACT,
    required:true,
    provider_reference_limit:12,
    semantic_reserved_count:reserved.length,
    available_reference_count:all.length,
    selected_reference_count:selected.length,
    omitted_reference_count:omitted.length,
    selected_references:selected,
    omitted_reference_keys:omitted.map(refKey),
    omitted_references:omitted.map(value=>({
      key:refKey(value),
      role:roleOf(value)||null,
      role_aliases:list(value?.role_aliases),
      reason:"PROVIDER_REFERENCE_BUDGET",
    })),
    required_authority_groups:requiredGroups.map(item=>item.group),
    missing_required_authority_groups:missingRequiredGroups,
    provider_transport_safe:
      reserved.length+selected.length<=12 &&
      missingRequiredGroups.length===0,
    provider_neutral:true,
    zero_provider_calls:true,
  };

  return Object.freeze({
    ...payload,
    passed:payload.provider_transport_safe===true,
    compiled_input:{
      ...input,
      reference_images:filterSelected(input.reference_images,selectedKeys),
      reference_assets:filterSelected(input.reference_assets,selectedKeys),
      source_assets:filterSelected(input.source_assets,selectedKeys),
      assets:filterSelected(input.assets,selectedKeys),
      image_generation_reference_manifest:payload,
    },
  });
}

export async function bindImageGenerationReferences(task={}){
  const compiled=compileImageGenerationReferences({task});
  if(compiled.required!==true)return task;
  if(compiled.passed!==true){
    throw new Error(
      "IMAGE_STUDIO_GENERATION_REFERENCE_TRANSPORT_UNSAFE:" +
      list(compiled.missing_required_authority_groups).join(","),
    );
  }
  const { ProductionTaskRuntime } = await import(
    "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
  );
  return ProductionTaskRuntime.update(task.id,{
    input:compiled.compiled_input,
    metadata:{
      ...object(task.metadata),
      image_generation_reference_manifest_contract:compiled.contract,
      image_generation_reference_count:compiled.selected_reference_count,
      image_generation_reference_omitted_count:compiled.omitted_reference_count,
      image_generation_reference_transport_safe:true,
    },
  });
}

export const CreativeImageGenerationReferenceCompilerRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_CONTRACT,
  limit:CREATIVE_IMAGE_GENERATION_REFERENCE_LIMIT,
  compile:compileImageGenerationReferences,
  bind:bindImageGenerationReferences,
});
