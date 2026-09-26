export const CREATIVE_IMAGE_STUDIO_MASK_LAYER_CONTRACT = "CREATIVE_IMAGE_STUDIO_MASK_LAYER_V1";

const SHAPES=Object.freeze(["RECT","ROUNDED_RECT","ELLIPSE"]);
function n(value,fallback=0){const next=Number(value);return Number.isFinite(next)?next:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function shape(value){const next=String(value||"RECT").toUpperCase();return SHAPES.includes(next)?next:"RECT";}

export function buildImageStudioMaskLayer({
  id, artboard_id, target_layer_id, region, mask_shape="RECT", feather=0,
  opacity=1, invert=false, radius=24, sort_order=0,
}={}){
  if(!id||!artboard_id||!target_layer_id) throw new Error("IMAGE_STUDIO_MASK_LAYER_SCOPE_REQUIRED");
  const width=Math.max(1,n(region?.width)),height=Math.max(1,n(region?.height));
  if(width<=0||height<=0) throw new Error("IMAGE_STUDIO_MASK_LAYER_REGION_REQUIRED");
  const resolvedShape=shape(mask_shape);
  return Object.freeze({
    id,artboard_id,parent_layer_id:null,source_asset_id:null,layer_type:"MASK",name:`Mask · ${resolvedShape.toLowerCase().replace("_"," ")}`,
    bounds:{x:n(region?.x),y:n(region?.y),width,height},transform:{rotation:0},style:{opacity:1},content:{},sort_order,
    visible:true,locked:false,
    metadata:{
      is_clip_mask:true,clip_mask_target_id:target_layer_id,dedicated_mask_layer:true,
      mask_shape:resolvedShape,mask_feather:clamp(n(feather),0,200),mask_opacity:clamp(n(opacity,1),0,1),
      mask_invert:invert===true,mask_radius:clamp(n(radius,24),0,Math.min(width,height)/2),
    },
  });
}

export function normalizeImageStudioMaskShape(value){return shape(value);}
export const CreativeImageStudioMaskLayerRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_MASK_LAYER_CONTRACT,shapes:SHAPES,build:buildImageStudioMaskLayer,normalizeShape:normalizeImageStudioMaskShape,
});
export default CreativeImageStudioMaskLayerRuntime;
