import { imageStudioAdjustmentPreviewStyle } from "./CreativeImageStudioAdjustmentRuntime.js";
import { adjustmentLayersForTarget, validateImageStudioAdjustmentMask } from "./CreativeImageStudioAdjustmentLayerRuntime.js";
import { imageStudioMaskPreviewStyle } from "./CreativeImageStudioReusableDesignRuntime.js";

export const CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_CONTRACT="CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_V1";

function clamp(value,min,max){const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:min));}

export function imageStudioAdjustmentPreviewDescriptors(layers=[],target={}){
  return adjustmentLayersForTarget(layers,target.id).map((layer)=>{
    const opacity=clamp(layer.style?.opacity??1,0,1);
    const adjustmentStyle=imageStudioAdjustmentPreviewStyle(layer.style||{});
    const maskId=layer.metadata?.adjustment_mask_layer_id||null;
    if(!maskId){
      return {id:layer.id,sort_order:Number(layer.sort_order||0),opacity,filter:adjustmentStyle.filter,mask_layer_id:null,mask_style:{},preview_supported:true,fidelity:"APPROXIMATE_COLOR_EXACT_SCOPE"};
    }
    const maskLayer=layers.find((item)=>item.id===maskId);
    const validation=validateImageStudioAdjustmentMask(layer,maskLayer);
    if(!validation.ready){
      return {id:layer.id,sort_order:Number(layer.sort_order||0),opacity,filter:adjustmentStyle.filter,mask_layer_id:maskId,mask_style:{},preview_supported:false,fidelity:"EXPORT_ONLY",failures:validation.failures};
    }
    const maskStyle=imageStudioMaskPreviewStyle(target,maskLayer);
    const exactScope=typeof maskStyle.clipPath==="string"&&!maskStyle.outline;
    return {id:layer.id,sort_order:Number(layer.sort_order||0),opacity,filter:adjustmentStyle.filter,mask_layer_id:maskId,mask_style:exactScope?maskStyle:{},preview_supported:exactScope,fidelity:exactScope?"APPROXIMATE_COLOR_EXACT_SCOPE":"EXPORT_ONLY",failures:exactScope?[]:["ADJUSTMENT_MASK_PREVIEW_COMPLEX"]};
  });
}

export const CreativeImageStudioAdjustmentPreviewRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_CONTRACT,descriptors:imageStudioAdjustmentPreviewDescriptors});
export default CreativeImageStudioAdjustmentPreviewRuntime;
