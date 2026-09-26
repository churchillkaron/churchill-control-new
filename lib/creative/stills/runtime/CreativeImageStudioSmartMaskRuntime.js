import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { buildImageStudioMaskLayer } from "./CreativeImageStudioMaskLayerRuntime.js";

export const CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT="CREATIVE_IMAGE_STUDIO_SMART_MASK_V1";
export const IMAGE_STUDIO_SMART_MASK_KINDS=Object.freeze(["SUBJECT","PERSON","PRODUCT","HAIR","SKY","FOREGROUND"]);
const FLOOR=Object.freeze({HAIR:{confidence:.9,edge:94,alignment:97},DEFAULT:{confidence:.93,edge:95,alignment:97}});

function text(v){return String(v??"").trim();}
function n(v,f=null){const x=Number(v);return Number.isFinite(x)?x:f;}
function kind(v){const next=text(v).toUpperCase();if(!IMAGE_STUDIO_SMART_MASK_KINDS.includes(next))throw new Error("IMAGE_STUDIO_SMART_MASK_KIND_UNSUPPORTED");return next;}
function floorFor(k){return k==="HAIR"?FLOOR.HAIR:FLOOR.DEFAULT;}

export async function requestImageStudioSmartMask({
 organization_id,creative_project_id,target_layer_id,source_asset_id,selection_kind,source_checksum=null,
 source_width=null,source_height=null,actor_id=null,production_graph_id=null,
}={}){
 if(!organization_id||!creative_project_id||!target_layer_id||!source_asset_id)throw new Error("IMAGE_STUDIO_SMART_MASK_SCOPE_REQUIRED");
 const resolvedKind=kind(selection_kind);
 return ProductionTaskRuntime.create({
  organization_id,creative_project_id,production_graph_id,
  type:"IMAGE_PROCESSING",status:"WAITING",
  title:`Smart mask · ${resolvedKind.toLowerCase()}`,
  description:"Create a source-aligned high-quality segmentation matte for one exact Image Studio layer. Preserve hair, product edges, transparencies and fine structure without modifying source pixels.",
  service_id:"creative.image.smart-mask",service_code:"creative.image.smart-mask",capability:"creative.image.smart-mask",
  priority:80,
  input:{
   target_layer_id,source_asset_id,selection_kind:resolvedKind,source_checksum,
   source_dimensions:{width:n(source_width),height:n(source_height)},
   output_spec:{type:"ALPHA_MATTE",format:"PNG",same_source_dimensions:true,background:"BLACK",subject:"WHITE",binary_or_soft_edges:"SOFT_EDGE_ALLOWED"},
  },
  cost:{estimated:0,actual:0,currency:null,approved:false},
  timing:{estimated_seconds:null},
  review:{required:true,approved:false},
  metadata:{
   production_step_id:"smart-mask",image_studio_operation:true,requested_by:actor_id,
   target_layer_id,source_asset_id,source_checksum,selection_kind:resolvedKind,
   exact_source_alignment_required:true,source_pixels_may_be_modified:false,quality_gate:true,
  },
 });
}

export function validateImageStudioSmartMaskResult({
 selection_kind,target_layer_id,source_asset_id,source_checksum=null,result={},
}={}){
 const resolvedKind=kind(selection_kind);
 const floor=floorFor(resolvedKind);
 const failures=[];
 if(text(result.target_layer_id)!==text(target_layer_id))failures.push("SMART_MASK_TARGET_LAYER_MISMATCH");
 if(text(result.source_asset_id)!==text(source_asset_id))failures.push("SMART_MASK_SOURCE_ASSET_MISMATCH");
 if(source_checksum&&text(result.source_checksum)!==text(source_checksum))failures.push("SMART_MASK_SOURCE_CHECKSUM_MISMATCH");
 if(!text(result.matte_asset_id))failures.push("SMART_MASK_MATTE_ASSET_REQUIRED");
 if(result.same_source_dimensions!==true)failures.push("SMART_MASK_SOURCE_DIMENSIONS_MISMATCH");
 const confidence=n(result.confidence_score); if(confidence===null||confidence<floor.confidence)failures.push("SMART_MASK_CONFIDENCE_BELOW_FLOOR");
 const edge=n(result.edge_quality_score); if(edge===null||edge<floor.edge)failures.push("SMART_MASK_EDGE_QUALITY_BELOW_FLOOR");
 const alignment=n(result.source_alignment_score); if(alignment===null||alignment<floor.alignment)failures.push("SMART_MASK_ALIGNMENT_BELOW_FLOOR");
 if(result.source_pixels_modified===true)failures.push("SMART_MASK_SOURCE_PIXELS_MODIFIED");
 if(!text(result.provider)&&!text(result.engine))failures.push("SMART_MASK_PROVENANCE_REQUIRED");
 return Object.freeze({contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,passed:failures.length===0,failures,selection_kind:resolvedKind,floor});
}

export function materializeImageStudioSmartMask({
 id,artboard_id,target_layer_id,source_asset_id,source_checksum=null,selection_kind,result,sort_order=0,
}={}){
 const validation=validateImageStudioSmartMaskResult({selection_kind,target_layer_id,source_asset_id,source_checksum,result});
 if(!validation.passed)throw new Error(`IMAGE_STUDIO_SMART_MASK_RESULT_REJECTED:${validation.failures.join(",")}`);
 const layer=buildImageStudioMaskLayer({
  id,artboard_id,target_layer_id,region:{x:0,y:0,width:Number(result.width||1),height:Number(result.height||1)},
  mask_shape:"RECT",sort_order,mask_source_asset_id:result.matte_asset_id,mask_source_kind:"RASTER_MATTE",
  provenance:{provider:result.provider||result.engine,model:result.model||null,task_id:result.task_id||null,selection_kind:validation.selection_kind,confidence_score:result.confidence_score,edge_quality_score:result.edge_quality_score,source_alignment_score:result.source_alignment_score,source_checksum:result.source_checksum||source_checksum||null},
 });
 return Object.freeze({...layer,name:`Smart mask · ${validation.selection_kind.toLowerCase()}`,metadata:{...layer.metadata,smart_mask:true,smart_mask_contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT}});
}

export const CreativeImageStudioSmartMaskRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_SMART_MASK_CONTRACT,kinds:IMAGE_STUDIO_SMART_MASK_KINDS,request:requestImageStudioSmartMask,validateResult:validateImageStudioSmartMaskResult,materialize:materializeImageStudioSmartMask});
export default CreativeImageStudioSmartMaskRuntime;
