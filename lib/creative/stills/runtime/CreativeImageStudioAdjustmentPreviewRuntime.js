import { imageStudioAdjustmentPreviewStyle } from "./CreativeImageStudioAdjustmentRuntime.js";
import { adjustmentLayersForTarget, validateImageStudioAdjustmentMask } from "./CreativeImageStudioAdjustmentLayerRuntime.js";
import { imageStudioMaskPreviewDescriptor } from "./CreativeImageStudioReusableDesignRuntime.js";

export const CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_CONTRACT="CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_V1";

function clamp(value,min,max){const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:min));}

export function imageStudioAdjustmentPreviewDescriptors(layers=[],target={},options={}){
  const maskUrlByLayerId=options?.mask_url_by_layer_id&&typeof options.mask_url_by_layer_id==="object"?options.mask_url_by_layer_id:{};
  const previewImage=options?.preview_image||{};
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
    const maskPreview=imageStudioMaskPreviewDescriptor(target,maskLayer,{mask_url:maskUrlByLayerId[maskId]||maskLayer?.metadata?.semantic_matte_preview_url||"",preview_image:previewImage});
    return {id:layer.id,sort_order:Number(layer.sort_order||0),opacity,filter:adjustmentStyle.filter,mask_layer_id:maskId,mask_style:maskPreview.preview_supported?maskPreview.style:{},preview_supported:maskPreview.preview_supported,fidelity:maskPreview.preview_supported?"APPROXIMATE_COLOR_EXACT_SCOPE":"EXPORT_ONLY",failures:maskPreview.preview_supported?[]:["ADJUSTMENT_MASK_PREVIEW_COMPLEX"],mask_preview_reason:maskPreview.preview_supported?null:maskPreview.reason};
  });
}

export const CreativeImageStudioAdjustmentPreviewRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_ADJUSTMENT_PREVIEW_CONTRACT,descriptors:imageStudioAdjustmentPreviewDescriptors});
export default CreativeImageStudioAdjustmentPreviewRuntime;
