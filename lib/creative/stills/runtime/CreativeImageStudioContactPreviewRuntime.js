import { imageStudioShadowSpec, normalizeImageStudioContactRealism } from "./CreativeImageStudioContactRealismRuntime.js";

export const CREATIVE_IMAGE_STUDIO_CONTACT_PREVIEW_CONTRACT="CREATIVE_IMAGE_STUDIO_CONTACT_PREVIEW_V1";

function n(value,fallback=0){const x=Number(value);return Number.isFinite(x)?x:fallback;}

export function imageStudioLocalOffsetForRotation(dx,dy,rotation){
  const rad=-n(rotation)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  return {x:dx*cos-dy*sin,y:dx*sin+dy*cos};
}

function previewColor(value){
  const text=String(value||"#ffffff");
  return /^#[0-9a-f]{6}$/i.test(text)?text:"#ffffff";
}

export function imageStudioLightWrapPreview({style={},scale=1,asset_url="",preview={},has_mask=false,mask_style={},has_edge_alpha=false}={}){
  const settings=normalizeImageStudioContactRealism(style);
  if(settings.light_wrap_strength<=0||settings.light_wrap_width_px<=0)return {preview_supported:false,reason:"LIGHT_WRAP_DISABLED",settings};
  if(!asset_url)return {preview_supported:false,reason:"ASSET_URL_REQUIRED",settings};
  const exactMaskStyle=!has_mask||(!mask_style?.outline&&(typeof mask_style?.clipPath==="string"||typeof mask_style?.maskImage==="string"||typeof mask_style?.WebkitMaskImage==="string"));
  if(has_mask&&!exactMaskStyle)return {preview_supported:false,reason:"MASKED_LIGHT_WRAP_EXPORT_ONLY",settings};
  if(has_edge_alpha)return {preview_supported:false,reason:"EDGE_FINISHED_LIGHT_WRAP_EXPORT_ONLY",settings};
  const image=preview?.image||{};
  const width=Math.max(1,n(image.width));
  const height=Math.max(1,n(image.height));
  if(width<=1||height<=1)return {preview_supported:false,reason:"PREVIEW_GEOMETRY_REQUIRED",settings};
  const resolvedScale=Math.max(.01,n(scale,1));
  return {
    preview_supported:true,
    reason:null,
    fidelity:"APPROXIMATE_RASTER_EXACT_BOUNDARY_CONCEPT",
    settings,
    radius:Math.max(.3,settings.light_wrap_width_px*resolvedScale),
    opacity:settings.light_wrap_strength,
    color:previewColor(settings.light_wrap_color),
    mask_style:has_mask?mask_style:{},
    image:{left:n(image.left),top:n(image.top),width,height},
  };
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
  lightWrap:imageStudioLightWrapPreview,
  groundShadow:imageStudioGroundShadowPreview,
});
export default CreativeImageStudioContactPreviewRuntime;
