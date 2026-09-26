import { applyImageStudioPixelAdjustments } from "./CreativeImageStudioAdjustmentRuntime.js";

export const CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_CONTRACT="CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_V2";
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function clamp(v,min,max){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?n:min));}

export function buildImageStudioAdjustmentLayer({id,artboard_id,target_layer_ids=[],sort_order=0,name="Adjustment"}={}){
  const targets=[...new Set(list(target_layer_ids).map(String).filter(Boolean))];
  if(!id||!artboard_id||!targets.length) throw new Error("IMAGE_STUDIO_ADJUSTMENT_LAYER_SCOPE_REQUIRED");
  return {
    id,artboard_id,parent_layer_id:null,source_asset_id:null,layer_type:"ADJUSTMENT",name,
    bounds:{x:0,y:0,width:1,height:1},transform:{rotation:0},
    style:{opacity:1,adjustments:{exposure:0,temperature:0,tint:0,shadows:0,highlights:0,levels:{black:0,gamma:1,white:255}}},
    content:{},sort_order,visible:true,locked:false,
    metadata:{adjustment_target_layer_ids:targets,adjustment_scope:"EXPLICIT_TARGETS",adjustment_mask_layer_id:null,non_destructive:true},
  };
}

export function adjustmentLayersForTarget(layers=[],targetId){
  return list(layers).filter(layer=>layer.visible!==false&&layer.layer_type==="ADJUSTMENT"&&list(layer.metadata?.adjustment_target_layer_ids).includes(targetId)).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
}

export function applyImageStudioAdjustmentLayers(raw,width,height,channels,layers=[],mask_alpha_by_layer_id={}){
  let current=Buffer.from(raw);
  const pixelCount=Math.max(0,Number(width||0)*Number(height||0));
  let maskedLayerCount=0;
  for(const layer of list(layers)){
    const opacity=clamp(layer.style?.opacity??1,0,1);
    if(opacity<=0)continue;
    const before=Buffer.from(current);
    const adjusted=applyImageStudioPixelAdjustments(current,width,height,channels,layer.style||{}).bytes;
    const maskAlpha=mask_alpha_by_layer_id?.[layer.id]||null;
    if(maskAlpha&&Number(maskAlpha.length)!==pixelCount)throw new Error(`IMAGE_STUDIO_ADJUSTMENT_MASK_ALPHA_SIZE_MISMATCH:${layer.id}`);
    if(maskAlpha)maskedLayerCount+=1;
    for(let p=0,i=0;i<current.length;p++,i+=channels){
      const sourceAlpha=channels>3?before[i+3]:255;
      if(sourceAlpha<=0)continue;
      const maskWeight=maskAlpha ? clamp(Number(maskAlpha[p]??0)/255,0,1) : 1;
      const weight=opacity*maskWeight;
      if(weight<=0)continue;
      for(let c=0;c<3;c++)current[i+c]=Math.round(before[i+c]*(1-weight)+adjusted[i+c]*weight);
      if(channels>3)current[i+3]=sourceAlpha;
    }
  }
  return {bytes:current,width,height,channels,layer_count:list(layers).length,masked_layer_count:maskedLayerCount,edge_safe_alpha:true};
}

export function validateImageStudioAdjustmentMask(layer={},maskLayer={}){
  const maskId=layer.metadata?.adjustment_mask_layer_id||null;
  if(!maskId)return {masked:false,ready:true,failures:[]};
  const failures=[];
  if(maskLayer?.id!==maskId)failures.push("ADJUSTMENT_MASK_MISSING");
  if(maskLayer?.id===maskId&&maskLayer?.layer_type!=="MASK")failures.push("ADJUSTMENT_MASK_LAYER_TYPE_INVALID");
  if(maskLayer?.artboard_id&&layer?.artboard_id&&maskLayer.artboard_id!==layer.artboard_id)failures.push("ADJUSTMENT_MASK_ARTBOARD_MISMATCH");
  const ownerId=maskLayer?.metadata?.adjustment_mask_owner_id;
  if(ownerId&&ownerId!==layer?.id)failures.push("ADJUSTMENT_MASK_OWNER_MISMATCH");
  const targets=list(layer.metadata?.adjustment_target_layer_ids);
  if(maskLayer?.metadata?.clip_mask_target_id&&!targets.includes(maskLayer.metadata.clip_mask_target_id))failures.push("ADJUSTMENT_MASK_TARGET_MISMATCH");
  return {masked:true,ready:failures.length===0,failures,mask_layer_id:maskId};
}

export const CreativeImageStudioAdjustmentLayerRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_CONTRACT,build:buildImageStudioAdjustmentLayer,forTarget:adjustmentLayersForTarget,applyPixels:applyImageStudioAdjustmentLayers,validateMask:validateImageStudioAdjustmentMask});
export default CreativeImageStudioAdjustmentLayerRuntime;
