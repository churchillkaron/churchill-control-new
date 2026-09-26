import { buildImageStudioMaskLayer } from "./CreativeImageStudioMaskLayerRuntime.js";

export const CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT="CREATIVE_IMAGE_STUDIO_SMART_MASK_V2";
export const IMAGE_STUDIO_SMART_MASK_KINDS=Object.freeze(["SUBJECT","FOREGROUND","BACKGROUND"]);

function text(v){return String(v??"").trim();}
function kind(v){const next=text(v).toUpperCase();if(!IMAGE_STUDIO_SMART_MASK_KINDS.includes(next))throw new Error("IMAGE_STUDIO_SMART_MASK_KIND_UNSUPPORTED");return next;}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}

function derivativeFor(result={},selectionKind){
  if(selectionKind==="BACKGROUND")return result.background||null;
  if(selectionKind==="FOREGROUND")return result.foreground||result.alpha||null;
  return result.alpha||result.foreground||null;
}

export async function requestImageStudioSmartMask({
 organization_id,creative_project_id,project,target_layer_id,source_asset_id,parent_asset_node_id=null,
 source_reference,selection_kind="SUBJECT",source_checksum=null,bbox=null,target_bounds=null,artboard_id=null,sort_order=0,
}={}){
 if(!organization_id||!creative_project_id||!project?.id||!target_layer_id||!source_asset_id)throw new Error("IMAGE_STUDIO_SMART_MASK_SCOPE_REQUIRED");
 if(!text(source_reference).startsWith("storage://"))throw new Error("IMAGE_STUDIO_SMART_MASK_GOVERNED_SOURCE_REQUIRED");
 const resolvedKind=kind(selection_kind);
 const { CreativeImageAssetDerivativeExecutionRuntime }=await import("@/lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime");
 const execution=await CreativeImageAssetDerivativeExecutionRuntime.executeSegmentation({
  organization_id,creative_project_id,project,parent_asset_node_id:parent_asset_node_id||source_asset_id,
  source_reference,bbox,
 });
 const derivative=derivativeFor(execution,resolvedKind);
 if(!derivative?.node?.id||!text(derivative.storage_reference||derivative.node?.url))throw new Error("IMAGE_STUDIO_SMART_MASK_DERIVATIVE_REQUIRED");
 const source=object(derivative.node?.technical);
 const result={
  target_layer_id,source_asset_id,source_checksum,
  matte_asset_id:derivative.node.id,matte_storage_reference:derivative.storage_reference||derivative.node.url,
  matte_checksum:derivative.checksum_sha256||derivative.node?.technical?.checksum||null,
  same_source_dimensions:true,source_pixels_modified:false,
  provider:"opencv",model:"grabcut-7-iter",selection_kind:resolvedKind,
  width:Number(source.width||target_bounds?.width||1),height:Number(source.height||target_bounds?.height||1),
  derivative_type:derivative.node?.metadata?.derivative_type||null,
  derivative_contract:derivative.contract||null,
 };
 const mask_layer=materializeImageStudioSmartMask({
  id:`mask-${crypto.randomUUID()}`,artboard_id,target_layer_id,source_asset_id,source_checksum,
  selection_kind:resolvedKind,result,target_bounds,sort_order,
 });
 return Object.freeze({contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,execution,result,mask_layer});
}

export function validateImageStudioSmartMaskResult({
 selection_kind,target_layer_id,source_asset_id,source_checksum=null,result={},
}={}){
 const resolvedKind=kind(selection_kind);
 const failures=[];
 if(text(result.target_layer_id)!==text(target_layer_id))failures.push("SMART_MASK_TARGET_LAYER_MISMATCH");
 if(text(result.source_asset_id)!==text(source_asset_id))failures.push("SMART_MASK_SOURCE_ASSET_MISMATCH");
 if(source_checksum&&text(result.source_checksum)!==text(source_checksum))failures.push("SMART_MASK_SOURCE_CHECKSUM_MISMATCH");
 if(!text(result.matte_asset_id))failures.push("SMART_MASK_MATTE_ASSET_REQUIRED");
 if(!text(result.matte_storage_reference).startsWith("storage://"))failures.push("SMART_MASK_GOVERNED_MATTE_REQUIRED");
 if(result.same_source_dimensions!==true)failures.push("SMART_MASK_SOURCE_DIMENSIONS_MISMATCH");
 if(result.source_pixels_modified===true)failures.push("SMART_MASK_SOURCE_PIXELS_MODIFIED");
 if(text(result.provider)!=="opencv")failures.push("SMART_MASK_PROVENANCE_REQUIRED");
 return Object.freeze({contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,passed:failures.length===0,failures,selection_kind:resolvedKind});
}

export function materializeImageStudioSmartMask({
 id,artboard_id,target_layer_id,source_asset_id,source_checksum=null,selection_kind,result,target_bounds=null,sort_order=0,
}={}){
 const validation=validateImageStudioSmartMaskResult({selection_kind,target_layer_id,source_asset_id,source_checksum,result});
 if(!validation.passed)throw new Error(`IMAGE_STUDIO_SMART_MASK_RESULT_REJECTED:${validation.failures.join(",")}`);
 const bounds=target_bounds&&Number(target_bounds.width)>0&&Number(target_bounds.height)>0
  ? target_bounds
  : {x:0,y:0,width:Number(result.width||1),height:Number(result.height||1)};
 const layer=buildImageStudioMaskLayer({
  id,artboard_id,target_layer_id,region:bounds,mask_shape:"RECT",sort_order,
  mask_source_asset_id:result.matte_asset_id,mask_source_kind:"RASTER_MATTE",
  provenance:{
   provider:result.provider,model:result.model||null,selection_kind:validation.selection_kind,
   matte_storage_reference:result.matte_storage_reference,matte_checksum:result.matte_checksum||null,
   derivative_type:result.derivative_type||null,derivative_contract:result.derivative_contract||null,
   source_asset_id,source_checksum:result.source_checksum||source_checksum||null,
  },
 });
 return Object.freeze({
  ...layer,
  name:`Smart mask · ${validation.selection_kind.toLowerCase()}`,
  metadata:{
   ...layer.metadata,smart_mask:true,smart_mask_contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,
   smart_mask_review_required:true,smart_mask_review_approved:false,smart_mask_status:"REVIEW_REQUIRED",
  },
 });
}

export const CreativeImageStudioSmartMaskRuntime=Object.freeze({
 contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,kinds:IMAGE_STUDIO_SMART_MASK_KINDS,
 request:requestImageStudioSmartMask,validateResult:validateImageStudioSmartMaskResult,materialize:materializeImageStudioSmartMask,
});
export default CreativeImageStudioSmartMaskRuntime;
