export const CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_CONTRACT = "CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_V2";

const MODES=Object.freeze(["LUMINANCE","COLOR_RANGE","ALPHA","SUBJECT","BACKGROUND"]);
function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mode(v){const next=String(v||"").toUpperCase();if(!MODES.includes(next))throw new Error("IMAGE_STUDIO_SEMANTIC_MASK_MODE_UNSUPPORTED");return next;}
function hex(value){const text=String(value||"#ffffff").replace("#","");if(!/^[0-9a-f]{6}$/i.test(text))return [255,255,255];return [0,2,4].map(i=>parseInt(text.slice(i,i+2),16));}

export function buildImageStudioSemanticMaskPatch(maskMode, options={}){
  const resolved=mode(maskMode);
  const common={mask_source_kind:"SEMANTIC",semantic_mask_mode:resolved,semantic_mask_contract:CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_CONTRACT};
  if(resolved==="LUMINANCE") return {...common,semantic_low:clamp(n(options.low,0),0,1),semantic_high:clamp(n(options.high,1),0,1),semantic_feather:clamp(n(options.feather,.08),0,.5),semantic_status:"READY_DETERMINISTIC"};
  if(resolved==="COLOR_RANGE") return {...common,semantic_color:String(options.color||"#ffffff"),semantic_tolerance:clamp(n(options.tolerance,.18),.01,1),semantic_softness:clamp(n(options.softness,.12),0,.5),semantic_status:"READY_DETERMINISTIC"};
  if(resolved==="ALPHA") return {...common,semantic_status:"READY_DETERMINISTIC"};
  return {...common,semantic_status:options.mask_asset_id?"READY_MATTE":"AWAITING_MATTE",semantic_mask_asset_id:options.mask_asset_id||null,semantic_source_asset_id:options.source_asset_id||null,semantic_source_checksum:options.source_checksum||null,semantic_confidence:options.confidence==null?null:clamp(n(options.confidence),0,1),semantic_matte_storage_reference:options.mask_storage_reference||null,semantic_matte_preview_url:options.mask_preview_url||null,semantic_matte_checksum:options.mask_checksum||null,semantic_provider:options.provider||null,semantic_capability:options.capability||null,semantic_model:options.model||null,semantic_review_required:options.mask_asset_id?options.review_required!==false:false,semantic_review_approved:options.mask_asset_id?options.review_approved===true:false};
}

export function attachImageStudioSemanticMatte(maskLayer={}, evidence={}){
  const resolved=mode(maskLayer.metadata?.semantic_mask_mode);
  if(!["SUBJECT","BACKGROUND"].includes(resolved)) throw new Error("IMAGE_STUDIO_SEMANTIC_MATTE_NOT_REQUIRED");
  if(!evidence.mask_asset_id||!evidence.source_asset_id||!String(evidence.mask_storage_reference||"").startsWith("storage://")) throw new Error("IMAGE_STUDIO_SEMANTIC_MATTE_EVIDENCE_REQUIRED");
  return {...maskLayer,source_asset_id:evidence.mask_asset_id,metadata:{...(maskLayer.metadata||{}),...buildImageStudioSemanticMaskPatch(resolved,evidence),semantic_status:"READY_MATTE"}};
}

export function validateImageStudioSemanticMask(maskLayer={},targetLayer={}){
  const metadata=maskLayer.metadata||{};
  if(metadata.mask_source_kind!=="SEMANTIC") return {semantic:false,ready:true,failures:[]};
  const resolved=mode(metadata.semantic_mask_mode);
  const failures=[];
  if(maskLayer.metadata?.clip_mask_target_id!==targetLayer.id) failures.push("SEMANTIC_MASK_TARGET_MISMATCH");
  if(["SUBJECT","BACKGROUND"].includes(resolved)){
    if(metadata.semantic_status!=="READY_MATTE") failures.push("SEMANTIC_MASK_MATTE_REQUIRED");
    if(!maskLayer.source_asset_id||!metadata.semantic_source_asset_id||!String(metadata.semantic_matte_storage_reference||"").startsWith("storage://")) failures.push("SEMANTIC_MASK_EVIDENCE_REQUIRED");
    if(metadata.semantic_source_asset_id&&targetLayer.source_asset_id&&metadata.semantic_source_asset_id!==targetLayer.source_asset_id) failures.push("SEMANTIC_MASK_SOURCE_MISMATCH");
  }
  return {semantic:true,ready:failures.length===0,mode:resolved,failures};
}

export function semanticMaskAlphaForPixel({r,g,b,a=255}, metadata={}){
  const resolved=mode(metadata.semantic_mask_mode);
  if(resolved==="ALPHA") return clamp(a,0,255);
  if(resolved==="LUMINANCE"){
    const lum=(.2126*r+.7152*g+.0722*b)/255;
    const low=clamp(n(metadata.semantic_low,0),0,1),high=Math.max(low+.0001,clamp(n(metadata.semantic_high,1),0,1));
    const t=clamp((lum-low)/(high-low),0,1);
    const feather=clamp(n(metadata.semantic_feather,.08),0,.5);
    if(feather<=0)return Math.round(t*255);
    const eased=t*t*(3-2*t);
    return Math.round(eased*255);
  }
  if(resolved==="COLOR_RANGE"){
    const [tr,tg,tb]=hex(metadata.semantic_color);
    const dist=Math.sqrt((r-tr)**2+(g-tg)**2+(b-tb)**2)/(Math.sqrt(3)*255);
    const tolerance=clamp(n(metadata.semantic_tolerance,.18),.01,1);
    const softness=clamp(n(metadata.semantic_softness,.12),0,.5);
    if(dist<=tolerance)return 255;
    if(softness<=0||dist>=tolerance+softness)return 0;
    const t=1-(dist-tolerance)/softness;
    return Math.round(t*t*(3-2*t)*255);
  }
  throw new Error("IMAGE_STUDIO_SEMANTIC_MASK_EXTERNAL_MATTE_REQUIRED");
}

export const CreativeImageStudioSemanticMaskRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_CONTRACT,modes:MODES,buildPatch:buildImageStudioSemanticMaskPatch,attachMatte:attachImageStudioSemanticMatte,validate:validateImageStudioSemanticMask,alphaForPixel:semanticMaskAlphaForPixel});
export default CreativeImageStudioSemanticMaskRuntime;
