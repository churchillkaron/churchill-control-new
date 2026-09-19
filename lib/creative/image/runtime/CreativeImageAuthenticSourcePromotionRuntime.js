import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

export const CREATIVE_IMAGE_AUTHENTIC_SOURCE_PROMOTION_CONTRACT =
  "CREATIVE_IMAGE_AUTHENTIC_SOURCE_PROMOTION_V1";

function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}

function assetUrl(asset={}){
  return text(
    asset.url ||
    asset.file_url ||
    asset.fileUrl ||
    asset.image_url ||
    asset.imageUrl ||
    asset.thumbnail_url
  )||null;
}

function provenance(asset={}){
  return object(
    asset.metadata?.brand_fidelity_asset ||
    asset.brand_fidelity_asset ||
    asset.provenance
  );
}

function directUseBlocked(asset={}){
  const analysis=object(asset.analysis);
  const metadata=object(asset.metadata);
  return asset.direct_use_blocked===true ||
    analysis.direct_use_blocked===true ||
    metadata.direct_use_blocked===true ||
    text(asset.use_mode).toUpperCase()==="REFERENCE_ONLY" ||
    text(analysis.use_mode).toUpperCase()==="REFERENCE_ONLY" ||
    text(metadata.use_mode).toUpperCase()==="REFERENCE_ONLY";
}

function route(task={}){
  return object(
    task.input?.requirements?.visual_production_route ||
    task.input?.generation?.production_route ||
    task.input?.provider_parameters?.visual_production_route
  );
}

function sourceId(task={}){
  return text(
    task.input?.requirements?.primary_source_asset_id ||
    task.input?.generation?.primary_source_asset_id ||
    task.input?.provider_parameters?.primary_source_asset_id ||
    task.metadata?.primary_source_asset_id
  )||null;
}

function assertRouteEvidence(task={},asset={}){
  const visualRoute=route(task);
  if(text(visualRoute.contract)!=="CREATIVE_VISUAL_PRODUCTION_ROUTE_V1"){
    throw new Error("AUTHENTIC_SOURCE_VISUAL_ROUTE_REQUIRED");
  }
  if(text(visualRoute.mode)!=="DIRECT_AUTHENTIC"){
    throw new Error("AUTHENTIC_SOURCE_DIRECT_ROUTE_REQUIRED");
  }
  if(visualRoute.source_truth_must_be_preserved!==true){
    throw new Error("AUTHENTIC_SOURCE_TRUTH_PRESERVATION_REQUIRED");
  }
  const evidence=object(visualRoute.evidence);
  const expected=sourceId(task);
  if(!expected||text(evidence.primary_source_asset_id)!==expected){
    throw new Error("AUTHENTIC_SOURCE_ROUTE_ID_MISMATCH");
  }
  const classification=text(provenance(asset).classification);
  if(!["AUTHENTIC_UPLOAD","TRUSTED_DERIVED"].includes(classification)){
    throw new Error("AUTHENTIC_SOURCE_PROVENANCE_REQUIRED");
  }
  if(directUseBlocked(asset)){
    throw new Error("AUTHENTIC_SOURCE_DIRECT_USE_BLOCKED");
  }
  const floors=[
    ["quality_score",82],
    ["composition_score",75],
    ["semantic_fit_score",80],
  ];
  for(const [key,min] of floors){
    const value=finite(evidence[key]);
    if(value!==null&&value<min){
      throw new Error("AUTHENTIC_SOURCE_ROUTE_EVIDENCE_BELOW_FLOOR:"+key);
    }
  }
  return {visualRoute,evidence,classification};
}

export async function promoteAuthenticSource(task={}){
  if(!task.organization_id||!task.creative_project_id){
    throw new Error("AUTHENTIC_SOURCE_SCOPE_REQUIRED");
  }
  const id=sourceId(task);
  if(!id)throw new Error("AUTHENTIC_SOURCE_ASSET_ID_REQUIRED");

  const assets=await CreativeAssetsRuntime.list({
    organization_id:task.organization_id,
    creative_project_id:task.creative_project_id,
    limit:1000,
  });
  const asset=assets.find(candidate=>
    text(candidate.id||candidate.asset_id)===id
  );
  if(!asset)throw new Error("AUTHENTIC_SOURCE_ASSET_NOT_FOUND:"+id);
  const url=assetUrl(asset);
  if(!url)throw new Error("AUTHENTIC_SOURCE_MEDIA_URL_REQUIRED");

  const checked=assertRouteEvidence(task,asset);
  return Object.freeze({
    contract:CREATIVE_IMAGE_AUTHENTIC_SOURCE_PROMOTION_CONTRACT,
    url,
    file_url:url,
    media_kind:"IMAGE",
    source_asset_id:id,
    source_provenance_classification:checked.classification,
    visual_production_route_contract:checked.visualRoute.contract,
    visual_production_mode:checked.visualRoute.mode,
    exact_source_pixels_preserved:true,
    source_truth_preserved:true,
    source_redesign_performed:false,
    image_generation_performed:false,
    provider_calls_performed:false,
    provider_neutral:true,
    route_evidence:checked.evidence,
  });
}

export const CreativeImageAuthenticSourcePromotionRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_AUTHENTIC_SOURCE_PROMOTION_CONTRACT,
  promote:promoteAuthenticSource,
});
