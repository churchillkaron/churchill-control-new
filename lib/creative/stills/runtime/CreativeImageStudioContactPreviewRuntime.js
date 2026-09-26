import { imageStudioShadowSpec } from "./CreativeImageStudioContactRealismRuntime.js";

export const CREATIVE_IMAGE_STUDIO_CONTACT_PREVIEW_CONTRACT="CREATIVE_IMAGE_STUDIO_CONTACT_PREVIEW_V1";

function n(value,fallback=0){const x=Number(value);return Number.isFinite(x)?x:fallback;}

export function imageStudioLocalOffsetForRotation(dx,dy,rotation){
  const rad=-n(rotation)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  return {x:dx*cos-dy*sin,y:dx*sin+dy*cos};
}

export function imageStudioGroundShadowPreview({style={},rotation=0,scale=1,asset_url="",preview={},mask_style={},has_mask=false}={}){
  const shadow=imageStudioShadowSpec(style);
  if(!shadow.enabled)return {preview_supported:false,reason:"SHADOW_DISABLED",shadow};
  if(!asset_url)return {preview_supported:false,reason:"ASSET_URL_REQUIRED",shadow};
  const exactMaskStyle=!has_mask||(!mask_style?.outline&&(
    typeof mask_style?.clipPath==="string"||
    typeof mask_style?.maskImage==="string"||
    typeof mask_style?.WebkitMaskImage==="string"
  ));
  if(!exactMaskStyle)return {preview_supported:false,reason:"COMPLEX_MASK_EXPORT_ONLY",shadow};
  const image=preview?.image||{};
  const frame=preview?.frame||{};
  const resolvedScale=Math.max(.01,n(scale,1));
  const offset=imageStudioLocalOffsetForRotation(n(shadow.offset_x)*resolvedScale,n(shadow.offset_y)*resolvedScale,rotation);
  const color=`rgb(${shadow.color.r} ${shadow.color.g} ${shadow.color.b})`;
  const outer_style={
    ...(has_mask?mask_style:{}),
    opacity:shadow.opacity,
    filter:`blur(${n(shadow.blur_px)*resolvedScale}px)`,
    transform:`translate(${offset.x}px,${offset.y}px)`,
  };
  const silhouette_style={
    backgroundColor:color,
    transform:`scaleY(${n(shadow.scale_y,1)})`,
    transformOrigin:"50% 100%",
    WebkitMaskImage:`url("${asset_url}")`,
    maskImage:`url("${asset_url}")`,
    WebkitMaskRepeat:"no-repeat",
    maskRepeat:"no-repeat",
    WebkitMaskSize:`${n(image.width)}px ${n(image.height)}px`,
    maskSize:`${n(image.width)}px ${n(image.height)}px`,
    WebkitMaskPosition:`${n(image.left)}px ${n(image.top)}px`,
    maskPosition:`${n(image.left)}px ${n(image.top)}px`,
    borderRadius:frame.borderRadius||0,
  };
  return {preview_supported:true,reason:null,fidelity:"APPROXIMATE_RASTER_EXACT_GEOMETRY",shadow,outer_style,silhouette_style};
}

export const CreativeImageStudioContactPreviewRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_CONTACT_PREVIEW_CONTRACT,
  localOffset:imageStudioLocalOffsetForRotation,
  groundShadow:imageStudioGroundShadowPreview,
});
export default CreativeImageStudioContactPreviewRuntime;
