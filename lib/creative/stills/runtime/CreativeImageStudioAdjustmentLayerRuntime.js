import { applyImageStudioPixelAdjustments } from "./CreativeImageStudioAdjustmentRuntime.js";

export const CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_CONTRACT="CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_V1";
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
    metadata:{adjustment_target_layer_ids:targets,adjustment_scope:"EXPLICIT_TARGETS",non_destructive:true},
  };
}

export function adjustmentLayersForTarget(layers=[],targetId){
  return list(layers).filter(layer=>layer.visible!==false&&layer.layer_type==="ADJUSTMENT"&&list(layer.metadata?.adjustment_target_layer_ids).includes(targetId)).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
}

export function applyImageStudioAdjustmentLayers(raw,width,height,channels,layers=[]){
  let current=Buffer.from(raw);
  for(const layer of list(layers)){
    const opacity=clamp(layer.style?.opacity??1,0,1);
    if(opacity<=0)continue;
    const before=Buffer.from(current);
    const adjusted=applyImageStudioPixelAdjustments(current,width,height,channels,layer.style||{}).bytes;
    if(opacity>=.999){current=Buffer.from(adjusted);continue;}
    for(let i=0;i<current.length;i+=channels){
      for(let c=0;c<3;c++)current[i+c]=Math.round(before[i+c]*(1-opacity)+adjusted[i+c]*opacity);
      if(channels>3)current[i+3]=before[i+3];
    }
  }
  return {bytes:current,width,height,channels,layer_count:list(layers).length};
}

export const CreativeImageStudioAdjustmentLayerRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_CONTRACT,build:buildImageStudioAdjustmentLayer,forTarget:adjustmentLayersForTarget,applyPixels:applyImageStudioAdjustmentLayers});
export default CreativeImageStudioAdjustmentLayerRuntime;
